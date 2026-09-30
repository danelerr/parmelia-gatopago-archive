import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { invitationCommand, invitationResult } from './wallet-invitations.mjs';

const issue = (capacity = '2') => invitationCommand(['issue', '--local', '--issuer', 'operator@example.com', '--hours', '24', '--capacity', capacity]);
function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../gatopago-wallet-core/migrations/0001_initial.sql', import.meta.url), 'utf8'));
  return db;
}
const user = 'usr_00000000-0000-4000-8000-000000000001';

test('requires an explicit database location and bounded issuance arguments', () => {
  for (const args of [[], ['issue'], ['issue', '--local', '--remote'], ['revoke', '--remote', '--hash', `0x${'ab'.repeat(32)}`],
    ['issue', '--local', '--issuer', "operator'; DELETE FROM users; --", '--hours', '1', '--capacity', '2'],
    ['issue', '--local', '--issuer', 'operator', '--hours', '169', '--capacity', '2'],
    ['issue', '--local', '--issuer', 'operator', '--hours', '1', '--capacity', '0']]) assert.throws(() => invitationCommand(args));
  assert.throws(() => invitationCommand(['revoke', '--remote', '--config', 'remote.jsonc', '--persist-to', '/tmp/test', '--hash', `0x${'ab'.repeat(32)}`]));
});

test('stores only token hashes, caps outstanding admission, and lets revocation release an unused place', () => {
  const db = database();
  try {
    const one = issue(), two = issue(), three = issue();
    assert.match(one.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(one.hash, `0x${createHash('sha256').update(one.token).digest('hex')}`);
    assert(!one.sql.includes(one.token)); assert(!one.wrangler.includes(one.token));
    const row = db.prepare(one.sql).get();
    assert.equal(invitationResult(one, JSON.stringify([{ success: true, results: [row] }])).token, one.token);
    assert(db.prepare(two.sql).get()); assert.equal(db.prepare(three.sql).get(), undefined);
    assert(!JSON.stringify(db.prepare('SELECT * FROM signup_invites').all()).includes(one.token));
    const revoke = invitationCommand(['revoke', '--local', '--hash', one.hash]);
    assert(db.prepare(revoke.sql).get()); assert.equal(db.prepare(revoke.sql).get(), undefined);
    assert(db.prepare(three.sql).get());
  } finally { db.close(); }
});

test('consumed invitations count as users and cannot be revoked to release capacity', () => {
  const db = database();
  try {
    const one = issue('1'); db.prepare(one.sql).run();
    db.prepare('INSERT INTO users(id,environment,created_at) VALUES (?,?,unixepoch())').run(user, 'staging');
    db.prepare('UPDATE signup_invites SET consumed_by = ?, consumed_at = unixepoch() WHERE token_hash = ?').run(user, one.hash);
    assert.equal(db.prepare(issue('1').sql).get(), undefined);
    assert.equal(db.prepare(invitationCommand(['revoke', '--local', '--hash', one.hash]).sql).get(), undefined);
    assert(db.prepare(issue('2').sql).get());
  } finally { db.close(); }
});

test('never returns a token on an empty, failed or mismatched database response', () => {
  const command = issue();
  for (const result of [[], [{ success: true, results: [] }], [{ success: false, results: [] }],
    [{ success: true, results: [{ token_hash: 'other', expires_at: 123 }] }]]) {
    assert.throws(() => invitationResult(command, JSON.stringify(result)));
  }
});
