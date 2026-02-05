import { NextResponse } from 'next/server';
import { signJwt } from '@/lib/jwt';

export async function POST(req: Request) {
  const { code, redirect_uri } = (await req.json()) as {
    code: string;
    redirect_uri: string;
  };

  const params = new URLSearchParams({
    client_id:     process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID!,
    client_secret: process.env.DISCORD_CLIENT_SECRET!,
    grant_type:    'authorization_code',
    code,
    redirect_uri
  });

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    params
  });

  const data = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.json(data, { status: tokenRes.status });
  }

  const accessToken = data.access_token as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ error: 'missing access_token' }, { status: 500 });
  }

  // Fetch Discord user once, then issue our own session JWT
  const userRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const userData = await userRes.json();
  if (!userRes.ok) {
    return NextResponse.json({ error: 'discord user lookup failed', details: userData }, { status: 502 });
  }

  const userId = userData?.id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: 'missing discord user id' }, { status: 502 });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'JWT_SECRET not set' }, { status: 500 });
  }

  const token = signJwt(userId, secret, 60 * 60 * 24 * 7); // 7 days
  const res = NextResponse.json({ access_token: accessToken });
  const isProd = process.env.NODE_ENV === 'production';
  res.cookies.set({
    name: 'session',
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
