import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const descriptor = 'shared/v3/web-release.json';
const paths = [
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'apps/web/package.json',
  'apps/web/next.config.ts', 'apps/web/postcss.config.mjs', 'apps/web/tsconfig.json', 'scripts/v3-web-release.mjs',
];
const skippedDirectories = new Set(['node_modules', '.git']);
function walk(directory) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      if (skippedDirectories.has(entry.name)) continue;
      throw new Error(`Symlink is not a reproducible Web input: ${path}`);
    }
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) walk(path);
    } else if (entry.isFile() && path !== descriptor) {
      if (entry.name.startsWith('.env') || entry.name.startsWith('.dev.vars')) {
        throw new Error(`Private configuration must not enter Web sources: ${path}`);
      }
      paths.push(path);
    }
  }
}
for (const directory of ['apps/web/src', 'apps/web/public', 'packages/brand', 'packages/environment', 'shared']) walk(directory);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inputs = [...new Set(paths)].sort().map((path) => {
  const bytes = readFileSync(resolve(root, path));
  // Git/Windows newline normalization must not change a release's identity.
  const content = /\.(?:[cm]?[jt]sx?|json|css|html|svg|md|txt|ya?ml)$/.test(path)
    ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes;
  return { path, sha256: sha256(content) };
});
const digest = sha256(JSON.stringify(inputs));
const expected = { schema_version: 1, client_release_id: `web-v3-${digest}`, source_sha256: digest, input_count: inputs.length };
if (process.argv[2] === '--describe') {
  process.stdout.write(JSON.stringify(expected, null, 2) + '\n');
} else {
  if (process.argv.length !== 2) throw new Error('Use --describe to print the descriptor; no files are written.');
  const actual = JSON.parse(readFileSync(resolve(root, descriptor), 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('V3 Web source differs from its release descriptor. Review inputs and update shared/v3/web-release.json using --describe before building Web or Wallet Core.');
  }
  process.stdout.write(`V3 Web release verified: ${expected.client_release_id} (${inputs.length} normalized inputs). Not deployment attestation.\n`);
}
