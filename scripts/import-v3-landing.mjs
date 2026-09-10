// One-shot, bounded Astro -> JSX migration. Not a build/runtime dependency.
// Inputs must match the reviewed E1 inventory; existing destinations are never overwritten.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
assert(process.argv.length === 3, 'Usage: node scripts/import-v3-landing.mjs <reviewed-landing-root>');
const sourceRoot = resolve(process.argv[2]);
const inventory = JSON.parse(readFileSync(resolve(root, 'docs/operations/v3-web-source-inventory.json'), 'utf8'));
function source(path) {
  const expected = inventory.sources.landing.files.find((entry) => entry.path === path);
  assert(expected, `Not inventoried: ${path}`);
  const bytes = readFileSync(resolve(sourceRoot, path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `Source changed: ${path}`);
  return bytes;
}
const pending = [];
function add(path, content) {
  assert(!existsSync(resolve(root, path)), `Destination exists: ${path}`);
  pending.push([path, content]);
}
const landing = source('src/components/RebrandLanding.astro').toString('utf8').replaceAll('\r\n', '\n');
const copyStart = landing.indexOf('const copy = {');
const copyEnd = landing.indexOf('\nconst t = copy[lang];');
assert(copyStart > 0 && copyEnd > copyStart);
add('apps/web/src/marketing/copy.ts', `${landing.slice(copyStart, copyEnd).replace('const copy =', 'export const copy =')}\n`);
let markup = landing.slice(landing.indexOf('\n---\n', copyEnd) + 5, landing.indexOf('\n<script>'));
assert(markup.startsWith('\n<a class="meli-skip-link"'));
markup = markup.replaceAll(' class=', ' className=').replaceAll(' hreflang=', ' hrefLang=')
  .replace("class:list={['meli-cycle-state', { 'is-active': index === 0 }]}", "className={`meli-cycle-state ${index === 0 ? 'is-active' : ''}`} key={state.id}")
  .replace("class:list={{ 'is-future': index === 3 }}", "className={index === 3 ? 'is-future' : undefined} key={channel}")
  .replace('<div className="meli-signal"', '<div key={title} className="meli-signal"')
  .replace('note) => <li>', 'note) => <li key={note}>')
  .replace('<button type="button" disabled>', '<button key={action} type="button" disabled>')
  .replace('<article className="meli-path-card"', '<article key={title} className="meli-path-card"')
  .replace('<article className="meli-control-card"', '<article key={title} className="meli-control-card"')
  .replace('([term, value]) => <div>', '([term, value]) => <div key={term}>')
  .replace('feature) => <li>', 'feature) => <li key={feature}>')
  .replace('<details className="meli-faq-item"', '<details key={question} className="meli-faq-item"')
  .replaceAll(' rel="external"', '');
assert(!markup.includes('class:list') && !markup.includes('Astro.'));
add('apps/web/src/marketing/Landing.tsx', `import { copy } from './copy';
import { CatGlyph } from './CatGlyph';
import { MeliSprite } from './MeliSprite';
import { LandingInteractions } from './LandingInteractions';
import { brand } from '../lib/brand';

export function Landing({ lang }: { lang: 'es' | 'en' }) {
  const isSpanish = lang === 'es';
  const localeHref = isSpanish ? '/en' : '/';
  const localeLabel = isSpanish ? 'EN' : 'ES';
  const appHref = '/app';
  const legalPrefix = isSpanish ? '' : '/en';
  const demoPaymentLink = new URL('/pay/demo-cafe-norte', brand.siteUrl).href;
  const demoPaymentPath = new URL(demoPaymentLink).pathname;
  const cardMailHref = '#card';
  const apiMailHref = '/docs';
  const t = copy[lang];
  return <>${markup}<LandingInteractions locale={lang} /></>;
}
`);
const glyph = source('src/components/CatGlyph.astro').toString('utf8').replaceAll('\r\n', '\n');
const glyphMarkup = glyph.slice(glyph.lastIndexOf('\n---\n') + 5).replaceAll('class=', 'className=').replaceAll('shape-rendering=', 'shapeRendering=');
add('apps/web/src/marketing/CatGlyph.tsx', `export function CatGlyph({ className = '', title = 'GatoPago', decorative = false }: { className?: string; title?: string; decorative?: boolean }) { return (${glyphMarkup}); }\n`);
add('apps/web/src/marketing/landing.css', source('src/styles/rebrand.css').toString('utf8').replaceAll('\r\n', '\n'));
for (const entry of inventory.sources.landing.files.filter(({ path }) => /^src\/assets\/meli\/[a-z-]+\.webp$/.test(path))) {
  add(entry.path.replace('src/assets/meli/', 'packages/brand/meli/'), source(entry.path));
}
for (const icon of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'og.png', 'Logo_gatopago.svg']) add(`apps/web/public/${icon}`, source(`public/${icon}`));
for (const [path, content] of pending) {
  mkdirSync(dirname(resolve(root, path)), { recursive: true });
  writeFileSync(resolve(root, path), content, { flag: 'wx' });
}
console.log(`Imported ${pending.length} reviewed sources/assets. JSX/content/interactions still require Next typecheck and browser parity review.`);
