import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSessionToken,
  readSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifySessionToken,
} from '../src/services/session.ts';

test('session tokens are valid only before their expiry and for the matching secret', () => {
  const now = 1_800_000_000_000;
  const token = createSessionToken('a-secure-session-secret-with-at-least-32-characters', now);

  assert.equal(verifySessionToken(token, 'a-secure-session-secret-with-at-least-32-characters', now), true);
  assert.equal(verifySessionToken(token, 'a-different-session-secret-with-at-least-32-characters', now), false);
  assert.equal(
    verifySessionToken(token, 'a-secure-session-secret-with-at-least-32-characters', now + SESSION_MAX_AGE_SECONDS * 1000),
    false,
  );
  assert.equal(verifySessionToken('invalid', 'a-secure-session-secret-with-at-least-32-characters', now), false);
});

test('session cookie parser selects the named cookie and safely rejects malformed encoding', () => {
  const token = createSessionToken('a-secure-session-secret-with-at-least-32-characters');

  assert.equal(readSessionCookie(`other=value; ${SESSION_COOKIE_NAME}=${token}`), token);
  assert.equal(readSessionCookie(`${SESSION_COOKIE_NAME}=%E0%A4%A`), undefined);
  assert.equal(readSessionCookie('other=value'), undefined);
});
