import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ORIGIN = 'https://www.funnyteesforall.com';
const ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const STATIC = ['/', '/products', '/privacy', '/cookies'];
const OPERATIONAL = ['/admin', '/success', '/cancel'];
const MISSING = '/products/seo-smoke-nonexistent';
const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt);/g, x => ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[x]);
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(), decode(m[2] ?? m[3] ?? m[4])]));
export function allowedAuditUrl(value) {
  try {
    const u = new URL(value);
    if (u.username || u.password || u.hash) return false;
    if (!(u.origin === ORIGIN || (['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && ['http:', 'https:'].includes(u.protocol)))) return false;
    if (![...STATIC, ...OPERATIONAL, '/robots.txt', '/sitemap.xml'].includes(u.pathname) && !/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(u.pathname)) return false;
    return [...u.searchParams].every(([k, v]) => k === 'utm_source' && v === 'seo-smoke');
  } catch { return false; }
}
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}
function renderedMarkup(html) {
  return stripComments(html).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
}
export function inspectHtml(html) {
  // Inspect rendered tags only; inert scripts/comments must not look like real metadata.
  const markup = renderedMarkup(html);
  const tags = name => [...markup.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(m => attrs(m[0]));
  const jsonLd = [...stripComments(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(m => attrs(m[1]).type?.toLowerCase() === 'application/ld+json').map(m => {
    try { return JSON.parse(m[2]); } catch { throw new Error('Invalid JSON-LD'); }
  });
  const productPaths = [...new Set(tags('a').flatMap(a => {
    try { const u = new URL(a.href, ORIGIN); return u.origin === ORIGIN && /^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(u.pathname) ? [u.pathname] : []; } catch { return []; }
  }))];
  return { title: decode(markup.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim(), canonicals: tags('link').filter(a => a.rel?.toLowerCase().split(/\s+/).includes('canonical')).map(a => a.href), robots: tags('meta').filter(a => ['robots', 'googlebot'].includes(a.name?.toLowerCase())).map(a => a.content ?? ''), jsonLd, productPaths };
}
export function checkPage(html, path, noindex = false) {
  const info = inspectHtml(html);
  if (noindex) return info.robots.some(r => /\bnoindex\b/i.test(r)) ? [] : ['Missing noindex'];
  const errors = [];
  if (info.canonicals.length !== 1 || (info.canonicals[0] !== ORIGIN + path && !(path === '/' && info.canonicals[0] === ORIGIN))) errors.push('Incorrect or duplicate canonical');
  if (!info.title) errors.push('Missing title');
  if (info.robots.some(r => /\bnoindex\b/i.test(r))) errors.push('Public page has noindex');
  if ((renderedMarkup(html).match(/<h1\b/gi) ?? []).length !== 1 && (path === '/' || path.startsWith('/products'))) errors.push('Expected one commercial H1');
  return errors;
}
export async function safeGet(value, { method = 'GET', fetcher = fetch } = {}) {
  if (method !== 'GET') throw new Error('Only GET allowed');
  if (!allowedAuditUrl(value)) throw new Error('Unsafe audit URL');
  // Reject all redirects, including safe ones, rather than risk side effects or lost assertions.
  const response = await fetcher(value, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'NoContextClub-SEO-Smoke/1.0' } });
  if (response.status >= 300 && response.status < 400) throw new Error('Redirect rejected');
  return response;
}
export function validateOutput(value) {
  const output = resolve(ROOT, value);
  const rel = relative(ROOT, output);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || rel.split(/[\\/]/).some(p => ['.git', 'node_modules', '.next'].includes(p.toLowerCase())) || extname(output) !== '.json' || existsSync(output)) throw new Error('Invalid output: use a new JSON file inside checkout');
  const parent = realpathSync(dirname(output));
  const parentRel = relative(ROOT, parent);
  if (parentRel.startsWith('..') || isAbsolute(parentRel)) throw new Error('Invalid output parent');
  return output;
}
export async function runAudit(base, fetcher = fetch) {
  const u = new URL(base);
  if (!allowedAuditUrl(base) || u.pathname !== '/' || u.search) throw new Error('Base URL must be an allowed origin');
  const report = { ok: false, scope: 'A only', base: u.origin, checks: [], failures: [], limitations: ['B variant selection and ProductGroup/Offer checks pending'], products: [] };
  const pages = new Map();
  async function get(path) {
    try {
      const r = await safeGet(u.origin + path, { fetcher });
      const body = await r.text();
      report.checks.push({ path, status: r.status });
      return { status: r.status, body };
    } catch (error) { report.failures.push(`${path}: ${error.message}`); return null; }
  }
  async function page(path, noindex = false, status = 200) {
    const r = await get(path);
    if (!r) return;
    if (r.status !== status) report.failures.push(`${path}: expected ${status}, received ${r.status}`);
    try {
      const clean = path.split('?')[0];
      for (const error of checkPage(r.body, clean, noindex)) report.failures.push(`${path}: ${error}`);
      if (!noindex && !path.includes('?')) pages.set(clean, inspectHtml(r.body));
    } catch (error) { report.failures.push(`${path}: ${error.message}`); }
  }
  for (const path of STATIC) await page(path);
  for (const path of OPERATIONAL) await page(path, true);
  const products = pages.get('/products')?.productPaths ?? [];
  report.products = products.slice(0, 20);
  if (!products.length) report.limitations.push('HTTP PDP coverage blocked: no safe catalog product links; use mocked page tests');
  if (products.length > 20) report.limitations.push('HTTP PDP checks capped at 20; sitemap comparison includes all catalog links');
  for (const path of report.products) await page(path);
  await page(MISSING, true, 404);
  for (const path of ['/', '/products', ...report.products]) await page(path + '?utm_source=seo-smoke');
  const titles = new Set();
  for (const [path, info] of pages) { if (titles.has(info.title)) report.failures.push(`${path}: duplicate title`); titles.add(info.title); }
  const robots = await get('/robots.txt');
  if (robots && (robots.status !== 200 || !robots.body.split(/\r?\n/).includes(`Sitemap: ${ORIGIN}/sitemap.xml`))) report.failures.push('robots: missing expected Sitemap or non-200');
  const sitemap = await get('/sitemap.xml');
  if (sitemap) {
    if (sitemap.status !== 200) report.failures.push(`sitemap: received ${sitemap.status}; public URL comparison unavailable`);
    else {
      const urls = [...sitemap.body.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map(m => decode(m[1]));
      const expected = [...STATIC, ...products].map(p => ORIGIN + p);
      if (new Set(urls).size !== urls.length || urls.length !== expected.length || expected.some(x => !urls.includes(x))) report.failures.push('sitemap: URLs differ from public static pages and catalog links');
    }
  }
  report.ok = report.failures.length === 0;
  return report;
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--base-url' || args[2] !== '--output') throw new Error('Usage: node scripts/verify-seo.mjs --base-url URL --output PATH');
  const output = validateOutput(args[3]); // Validate before any network activity.
  const report = await runAudit(args[1]);
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
