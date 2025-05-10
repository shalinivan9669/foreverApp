import { NextResponse } from 'next/server';

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
  return NextResponse.json({ access_token: data.access_token });
}
