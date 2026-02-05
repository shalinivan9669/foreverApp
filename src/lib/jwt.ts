import crypto from 'crypto';

type JwtPayload = {
  sub: string;
  iat: number;
  exp: number;
};

const toBase64Url = (input: Buffer | Uint8Array) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const fromBase64Url = (input: string) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
};

export function signJwt(sub: string, secret: string, ttlSeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub, iat: now, exp: now + ttlSeconds };

  const head = toBase64Url(Buffer.from(JSON.stringify(header), 'utf8'));
  const body = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const data = `${head}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest();
  return `${data}.${toBase64Url(sig)}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const data = `${head}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest();
  const actual = fromBase64Url(sig);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(body).toString('utf8')) as JwtPayload;
    if (!payload?.sub || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
