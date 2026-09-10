import type { AuthBindings } from './config';

type LimitScope = 'ip' | 'email' | 'global';

export async function privateLimitKey(env: AuthBindings, scope: LimitScope, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.AUTH_RATE_LIMIT_PEPPER),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key,
    encoder.encode(JSON.stringify(['gatopago-v3-auth', env.GATOPAGO_ENVIRONMENT, scope, value])));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** One conditional write, never read-then-increment. Rejections do not extend a hold. */
export async function consumeLimit(db: AuthBindings['WALLET_DB'], scope: LimitScope,
  key: string, now: number): Promise<boolean> {
  const [limit, window, cooldown] = scope === 'email' ? [3, 900, 60] :
    scope === 'ip' ? [20, 3600, 0] : [2000, 3600, 0];
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid quota time');
  const result = await db.prepare(`
    INSERT INTO auth_send_limits (scope, key_hash, count, reset_at, next_allowed_at)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(scope, key_hash) DO UPDATE SET
      count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END,
      next_allowed_at = ?
    WHERE reset_at <= ? OR (count < ? AND next_allowed_at <= ?)
  `).bind(scope, key, now + window, now + cooldown, now, now, now + window,
    now + cooldown, now, limit, now).run();
  if (!result.success || ![0, 1].includes(result.meta.changes)) throw new Error('Quota write failed');
  return result.meta.changes === 1;
}

export async function pruneLimits(db: AuthBindings['WALLET_DB'], now: number): Promise<void> {
  // Bounded work; a malicious request cannot turn cleanup into an unbounded scan.
  const result = await db.prepare(`DELETE FROM auth_send_limits WHERE rowid IN
    (SELECT rowid FROM auth_send_limits WHERE reset_at <= ? ORDER BY reset_at LIMIT 256)`)
    .bind(now).run();
  if (!result.success) throw new Error('Quota cleanup failed');
}
