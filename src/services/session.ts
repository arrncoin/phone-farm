import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'farm_session';
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export function createSessionToken(secret: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS;
  const signature = createHmac('sha256', secret).update(String(expiresAt)).digest('base64url');
  return `${expiresAt}.${signature}`;
}

export function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;

  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) return false;

  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;

  const suppliedSignature = Buffer.from(token.slice(separator + 1));
  const expectedSignature = Buffer.from(
    createHmac('sha256', secret).update(String(expiresAt)).digest('base64url'),
  );
  return (
    suppliedSignature.length === expectedSignature.length &&
    timingSafeEqual(suppliedSignature, expectedSignature)
  );
}

export function readSessionCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;

  for (const cookie of cookieHeader.split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;

    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}
