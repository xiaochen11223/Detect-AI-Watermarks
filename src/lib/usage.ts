/**
 * Daily usage / quota logic for the AI watermark detector.
 *
 * Two identities:
 *  - Anonymous: limited by IP hash + browser cookie (PRD R-0401)
 *  - Logged-in: limited by user id (PRD R-0403)
 *
 * Backed by the `usage_logs` table (see `src/config/db/schema.{sqlite,postgres,mysql}.ts`)
 * with one row per (user_id OR ip_hash) per UTC date.
 */

import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { usageLogs } from '@/config/db/schema';
import { getClientIp } from '@/shared/lib/ip';
import { md5 } from '@/shared/lib/hash';
import { getSignUser } from '@/shared/models/user';

/** Cookie name used to identify anonymous repeat visitors across same IP (NAT). */
export const ANON_COOKIE_NAME = 'wa_anon_id';

/** UTC date in YYYY-MM-DD form, used as the natural key for daily aggregation. */
function utcDateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export interface UsageContext {
  userId: string | null;
  ipHash: string;
  anonId: string;
  date: string;
  isLogin: boolean;
  limit: number;
  used: number;
  remaining: number;
}

/** Read the per-request anon cookie value from the incoming Cookie header. */
function readAnonCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return '';
  const match = cookieHeader.match(new RegExp(`${ANON_COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : '';
}

/** Resolve the current caller's identity + today's usage snapshot. */
export async function getCurrentUsage(): Promise<UsageContext> {
  const h = await headers();
  const ip = getClientIpSync(h);
  const cookieHeader = h.get('cookie') ?? '';
  const anonId = readAnonCookie(cookieHeader);
  const ipHash = md5(`${ip}|${anonId || 'no-cookie'}|${process.env.AUTH_SECRET || 'salt'}`);

  const user = await getSignUser();
  const userId = user?.id ?? null;
  const isLogin = !!userId;

  const date = utcDateKey();
  const limit = Number(
    isLogin ? process.env.USER_DAILY_LIMIT : process.env.ANON_DAILY_LIMIT
  );

  // Look up today's count for this identity (login wins over anon).
  const identityFilter = isLogin
    ? eq(usageLogs.userId, userId!)
    : and(eq(usageLogs.ipHash, ipHash), eq(usageLogs.userId, ''));
  const rows = await db()
    .select()
    .from(usageLogs)
    .where(identityFilter);

  const todayRow = rows.find((r: any) => r.date === date);
  const used = Number(todayRow?.count ?? 0);

  return {
    userId,
    ipHash,
    anonId,
    date,
    isLogin,
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

/** Check whether the caller can still perform a detection. */
export function canAnalyze(ctx: UsageContext): boolean {
  return ctx.used < ctx.limit;
}

/** Increment today's usage count by 1, upserting the daily row. */
export async function incrementUsage(ctx: UsageContext): Promise<void> {
  const existing = await db()
    .select()
    .from(usageLogs)
    .where(
      ctx.isLogin
        ? eq(usageLogs.userId, ctx.userId!)
        : and(eq(usageLogs.ipHash, ctx.ipHash), eq(usageLogs.userId, ''))
    );

  const todayRow = existing.find((r: any) => r.date === ctx.date);

  if (todayRow) {
    await db()
      .update(usageLogs)
      .set({ count: Number(todayRow.count) + 1 })
      .where(eq(usageLogs.id, todayRow.id));
    return;
  }

  // Insert new daily row. Use string id (uuid-style) for cross-dialect compat.
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await db().insert(usageLogs).values({
    id,
    userId: ctx.userId ?? '',
    ipHash: ctx.ipHash,
    date: ctx.date,
    count: 1,
    createdAt: new Date(),
  });
}

// --- helpers ---

// Synchronous IP reader (getClientIp in the template is async because it awaits headers()).
function getClientIpSync(h: Headers): string {
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    (h.get('x-forwarded-for') || '127.0.0.1').split(',')[0] ||
    '127.0.0.1'
  );
}
