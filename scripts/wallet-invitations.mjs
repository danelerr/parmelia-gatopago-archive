import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const walletRoot = resolve(import.meta.dirname, '../gatopago-wallet-core');
const help = `Issue one invitation:
  pnpm wallet:invites issue --local --issuer daniel --hours 24 --capacity 100
Revoke an unused invitation by its non-secret hash:
  pnpm wallet:invites revoke --local --hash 0x...
Remote operations require --remote --config <provisioned-wallet-wrangler.jsonc>.
Optional --persist-to <directory> isolates local storage. Never pass invitation tokens as arguments.
Capacity counts all users plus unexpired, unused invitations. Use the same approved capacity for the beta.`;

export function invitationCommand(args) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    local: { type: 'boolean' }, remote: { type: 'boolean' }, config: { type: 'string' },
    'persist-to': { type: 'string' }, issuer: { type: 'string' }, hours: { type: 'string' },
    capacity: { type: 'string' }, hash: { type: 'string' },
  } });
  if (positionals.length !== 1 || !['issue', 'revoke'].includes(positionals[0]) || !!values.local === !!values.remote) throw new Error(help);
  if (values.remote && (!values.config || values['persist-to'])) throw new Error('Remote operations require an explicit config and cannot use local persistence.');
  const config = resolve(values.config ?? resolve(walletRoot, 'wrangler.jsonc'));
  const wrangler = ['exec', 'wrangler', 'd1', 'execute', 'WALLET_DB', '--config', config,
    values.local ? '--local' : '--remote', '--json'];
  if (values['persist-to']) wrangler.push('--persist-to', resolve(values['persist-to']));
  let token, hash, sql;
  if (positionals[0] === 'issue') {
    if (values.hash || !/^[A-Za-z0-9@._:-]{1,128}$/.test(values.issuer ?? '')
      || !/^[1-9][0-9]{0,2}$/.test(values.hours ?? '') || Number(values.hours) > 168
      || !/^[1-9][0-9]{0,4}$/.test(values.capacity ?? '')) throw new Error('Issue requires an issuer, hours (1–168) and capacity (1–99999), without --hash.');
    token = randomBytes(32).toString('base64url');
    hash = `0x${createHash('sha256').update(token).digest('hex')}`;
    // All interpolated values are bounded above. One conditional write serializes
    // competing operators with registration; no read-then-insert quota race.
    sql = `INSERT INTO signup_invites(token_hash,issued_by,created_at,expires_at)
      SELECT '${hash}','${values.issuer}',unixepoch(),unixepoch()+${Number(values.hours) * 3600}
      WHERE (SELECT count(*) FROM users) + (SELECT count(*) FROM signup_invites
        WHERE consumed_by IS NULL AND revoked_at IS NULL AND expires_at > unixepoch()) < ${Number(values.capacity)}
      RETURNING token_hash,expires_at`;
  } else {
    if (values.issuer || values.hours || values.capacity || !/^0x[0-9a-f]{64}$/.test(values.hash ?? '')) throw new Error('Revoke requires only a valid --hash and the database options.');
    hash = values.hash;
    sql = `UPDATE signup_invites SET revoked_at = unixepoch() WHERE token_hash = '${hash}'
      AND consumed_by IS NULL AND revoked_at IS NULL RETURNING token_hash,expires_at`;
  }
  return { wrangler: [...wrangler, '--command', sql], sql, hash, token };
}

export function invitationResult(command, output) {
  const results = JSON.parse(output);
  if (!Array.isArray(results) || results.length !== 1 || results[0].success !== true || results[0].results?.length !== 1
    || results[0].results[0].token_hash !== command.hash || !Number.isSafeInteger(results[0].results[0].expires_at)) {
    throw new Error('No invitation returned: capacity reached, invitation unavailable, or invalid database response.');
  }
  return { ...results[0].results[0], ...(command.token ? { token: command.token } : { revoked: true }) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).join(' ') === '--help') console.log(help);
  else {
    let command;
    try {
      command = invitationCommand(process.argv.slice(2));
      const output = execFileSync('pnpm', command.wrangler, { cwd: walletRoot, encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, maxBuffer: 1_048_576 });
      // The secret is printed once, only after a confirmed write, never sent to Wrangler.
      console.log(JSON.stringify(invitationResult(command, output)));
    } catch (error) {
      console.error(error instanceof Error && !('stderr' in error) ? error.message : 'Wrangler failed; verify the selected database and Cloudflare operator credentials.');
      if (command) console.error(`Invitation reference: ${command.hash}. Check this reference before retrying an uncertain write.`);
      process.exitCode = 1;
    }
  }
}
