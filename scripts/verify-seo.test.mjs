import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedAuditUrl, inspectHtml, checkPage, safeGet, validateOutput, runAudit } from './verify-seo.mjs';
const origin = 'https://www.funnyteesforall.com';
const html = (path, title = path) => `<title>${title}</title><link href='${origin}${path}' rel='canonical'><h1>Shop</h1>`;
test('rejects unsafe destinations and sensitive paths/queries', () => {
  for (const value of ['https://evil.test/', 'https://user:pass@www.funnyteesforall.com/', 'http://www.funnyteesforall.com/', 'https://www.funnyteesforall.com:444/', 'http://localhost/api/orders', 'http://127.0.0.1/%61pi/test', 'http://localhost/cart', 'http://localhost/success?session_id=real']) assert.equal(allowedAuditUrl(value), false, value);
  for (const value of ['http://127.0.0.1:3210/', 'http://localhost/products/test', 'http://[::1]/robots.txt', origin + '/products?utm_source=seo-smoke']) assert.equal(allowedAuditUrl(value), true, value);
});
test('extracts metadata regardless of quotes and attribute order and unique product paths', () => {
  const result = inspectHtml(`<title>A &amp; B</title><link href='/a' rel='canonical'><link rel="canonical" href="/b"><meta content='noindex, nofollow' name='robots'><script type='application/ld+json'>{"@type":"Organization"}</script><a href='/products/tee'>T</a><a href="/products/tee?utm_source=x">T</a>`);
  assert.deepEqual(result, { title: 'A & B', canonicals: ['/a', '/b'], robots: ['noindex, nofollow'], jsonLd: [{ '@type': 'Organization' }], productPaths: ['/products/tee'] });
  assert.throws(() => inspectHtml('<script type="application/ld+json">{bad}</script>'), /JSON-LD/);
});
test('detects duplicate/wrong canonical and missing noindex', () => {
  assert.deepEqual(checkPage(html('/products'), '/products'), []);
  assert.match(checkPage(html('/wrong'), '/products').join(), /canonical/);
  assert.match(checkPage(html('/products') + `<link rel='canonical' href='${origin}/products'>`, '/products').join(), /canonical/);
  assert.match(checkPage('<title>Admin</title>', '/admin', true).join(), /noindex/);
  assert.deepEqual(checkPage('<meta name="robots" content="noindex">', '/admin', true), []);
});
test('network guard rejects methods and redirects before second request', async () => {
  let count = 0;
  const fetcher = async () => { count++; return new Response('', { status: 302, headers: { location: 'https://evil.test/' } }); };
  await assert.rejects(safeGet('http://localhost/', { method: 'POST', fetcher }), /GET/);
  assert.equal(count, 0);
  await assert.rejects(safeGet('http://localhost/', { fetcher }), /redirect/i);
  assert.equal(count, 1);
});
test('output is a new JSON file inside checkout, outside protected paths', () => {
  assert.throws(() => validateOutput('../outside.json'), /output/i);
  assert.throws(() => validateOutput('.git/result.json'), /output/i);
  assert.throws(() => validateOutput('package.json'), /output/i);
  assert.match(validateOutput('seo-smoke-new-result.json'), /seo-smoke-new-result.json$/);
});
test('audit detects unavailable sitemap and absent safe PDP coverage', async () => {
  const report = await runAudit('http://localhost:3210', async url => {
    const path = new URL(url).pathname;
    if (path === '/sitemap.xml') return new Response('unavailable', { status: 503 });
    if (path === '/robots.txt') return new Response(`Sitemap: ${origin}/sitemap.xml`);
    if (path === '/products/seo-smoke-nonexistent') return new Response('<meta name="robots" content="noindex">', { status: 404 });
    return new Response(html(path) + (['/admin', '/success', '/cancel'].includes(path) ? '<meta name="robots" content="noindex">' : ''));
  });
  assert.equal(report.ok, false);
  assert.ok(report.failures.some(x => /sitemap.*503/i.test(x)));
  assert.ok(report.limitations.some(x => /PDP/.test(x)));
});
test('audit checks catalog products, clean tracking canonicals, titles and sitemap equality', async () => {
  const requests = [];
  const report = await runAudit('http://127.0.0.1:3210', async (url, options) => {
    requests.push({ url, options });
    const path = new URL(url).pathname;
    if (path === '/sitemap.xml') return new Response(`<urlset>${['/', '/products', '/privacy', '/cookies', '/products/tee'].map(p => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`);
    if (path === '/robots.txt') return new Response(`Sitemap: ${origin}/sitemap.xml`);
    if (path === '/products/seo-smoke-nonexistent') return new Response('<meta name="robots" content="noindex">', { status: 404 });
    return new Response(html(path) + (path === '/products' ? '<a href="/products/tee">T</a>' : '') + (['/admin', '/success', '/cancel'].includes(path) ? '<meta name="robots" content="noindex">' : ''));
  });
  assert.deepEqual(report.failures, []);
  assert.equal(report.ok, true);
  assert.deepEqual(report.products, ['/products/tee']);
  assert.ok(requests.some(r => r.url.endsWith('/products/tee?utm_source=seo-smoke')));
  assert.ok(requests.every(r => r.options.method === 'GET' && r.options.redirect === 'manual'));
});
test('rejects protected output directories case-insensitively on Windows', () => {
  assert.throws(() => validateOutput('.GIT/seo-result.json'), /output/i);
});
test('accepts equivalent root canonical serialization emitted by Next', () => {
  assert.deepEqual(checkPage(`<title>Home</title><link rel="canonical" href="https://www.funnyteesforall.com"><h1>Shop</h1>`, '/'), []);
});
