import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';

function isPrivateIp(address: string) {
  if (address.includes(':')) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

async function assertPublicHostname(hostname: string) {
  let lookup: typeof import('node:dns/promises').lookup;

  try {
    lookup = (await import('node:dns/promises')).lookup;
  } catch {
    throw new Error('DNS validation unavailable');
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isPrivateIp(address))
  ) {
    throw new Error('Host resolves to a blocked address');
  }
}

export async function GET(req: NextRequest) {
  const user = await getUserInfo();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new NextResponse('Invalid url', { status: 400 });
  }

  if (parsed.protocol !== 'https:') {
    return new NextResponse('Only https allowed', { status: 400 });
  }

  // Block IP literals (v4/v6) and single-label hosts to defend against SSRF
  // against private ranges (10/8, 192.168/16, 172.16/12) and cloud metadata
  // endpoints (169.254.169.254). Requires hostname to be a multi-label name
  // with at least one alphabetic character.
  const hostname = parsed.hostname.toLowerCase();
  if (
    !/^[a-z0-9.-]+$/.test(hostname) ||
    !hostname.includes('.') ||
    !/[a-z]/.test(hostname)
  ) {
    return new NextResponse('Host not allowed', { status: 400 });
  }

  try {
    await assertPublicHostname(hostname);

    const response = await fetch(parsed.toString());

    if (!response.ok) {
      return new NextResponse(`Failed to fetch file: ${response.statusText}`, {
        status: response.status,
      });
    }

    const contentType =
      response.headers.get('content-type') || 'application/octet-stream';

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
      },
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
