/**
 * POST /api/detect
 *
 * Server-side entry point for the AI watermark detector. Flow (PRD 4.1 / 5.5):
 *  1. Resolve identity (login or anon IP+cookie) and check daily limit.
 *  2. Scan the submitted text for hidden Unicode characters using the shared
 *     watermark-scanner lib (front-end uses the same lib).
 *  3. If hidden chars are found, call Hive AI-Generated Content Detection API
 *     as a server-side second opinion. On any failure, degrade to null.
 *  4. Increment today's usage count.
 *  5. Return the scan result + optional AI review.
 *
 * Privacy (PRD 5.6 / R-0501, R-0502):
 *  - The submitted text is NEVER persisted to the database.
 *  - The text is only forwarded to Hive when suspicious patterns are found.
 */

import { NextResponse } from 'next/server';

import { scanText } from '@/lib/watermark-scanner';
import { reviewWithHive } from '@/lib/hive';
import {
  canAnalyze,
  getCurrentUsage,
  incrementUsage,
  ANON_COOKIE_NAME,
} from '@/lib/usage';

export const runtime = 'nodejs';

const MAX_INPUT_CHARS = 20000;

export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_request', message: 'Invalid JSON body.' },
      { status: 400 }
    );
  }

  const text: string = typeof body?.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json(
      { error: 'empty_text', message: 'Please paste some text to analyze.' },
      { status: 400 }
    );
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      {
        error: 'too_long',
        message: `Input exceeds the ${MAX_INPUT_CHARS} character limit.`,
      },
      { status: 413 }
    );
  }

  // 1. Identity + quota check
  const usage = await getCurrentUsage();
  if (!canAnalyze(usage)) {
    return NextResponse.json(
      {
        error: 'limit_reached',
        message:
          "You've used your 5 free checks today. Sign up for free to get 50 checks/day.",
        usage: {
          used: usage.used,
          limit: usage.limit,
          remaining: 0,
          is_login: usage.isLogin,
        },
        upgrade: {
          title: 'Sign Up Free',
          url: '/sign-up',
        },
      },
      {
        status: 429,
        headers: {
          // Persist the anon id so the limit survives cookie loss.
          'Set-Cookie': `${ANON_COOKIE_NAME}=${usage.anonId || generateAnonId()}; Path=/; Max-Age=86400; SameSite=Lax`,
        },
      }
    );
  }

  // 2. Scan
  const scan = scanText(text);

  // 3. AI review (only when hidden chars found — PRD R-0301)
  let aiReview = null;
  if (scan.hitCount > 0) {
    const hitsSummary = Object.entries(scan.hitByChar).map(([hexCode, count]) => {
      const def = scan.hits.find((h) => h.hexCode === hexCode);
      return {
        hexCode,
        name: def?.name ?? hexCode,
        count,
      };
    });
    aiReview = await reviewWithHive(text, hitsSummary);
  }

  // 4. Record usage (always, even if no hits — calling the tool counts)
  await incrementUsage(usage);

  // 5. Response
  const response: any = {
    hits: scan.hits,
    clean_text: scan.cleanText,
    hit_count: scan.hitCount,
    hit_by_type: scan.hitByType,
    hit_by_char: scan.hitByChar,
    ai_review: aiReview,
    usage: {
      used: usage.used + 1,
      limit: usage.limit,
      remaining: Math.max(0, usage.limit - usage.used - 1),
      is_login: usage.isLogin,
    },
  };

  return NextResponse.json(response, {
    headers: {
      'Set-Cookie': `${ANON_COOKIE_NAME}=${usage.anonId || generateAnonId()}; Path=/; Max-Age=86400; SameSite=Lax`,
    },
  });
}

function generateAnonId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
