import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedAuditUrl, allowedVariantAuditUrl, inspectHtml, checkPage, safeGet, validateOutput, runAudit } from './verify-seo.mjs';
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
test('ignores JSON-LD inside HTML comments while checking rendered scripts', () => {
  const result = inspectHtml('<!-- <script type="application/ld+json">{bad}</script> --><script type="application/ld+json">{"@type":"Organization"}</script>');
  assert.deepEqual(result.jsonLd, [{ '@type': 'Organization' }]);
  assert.throws(() => inspectHtml('<!-- <script type="application/ld+json">{"@type":"Organization"}</script> --><script type="application/ld+json">{bad}</script>'), /JSON-LD/);
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
test('rejects a commercial page whose only H1 is inside a comment or script', () => {
  const metadata = `<title>Shop</title><link rel="canonical" href="https://www.funnyteesforall.com/products">`;
  for (const inert of ['<!-- <h1>Invisible</h1> -->', '<script>const example = "<h1>Invisible</h1>";</script>']) {
    assert.ok(checkPage(metadata + inert, '/products').includes('Expected one commercial H1'));
  }
});
test('accepts one real commercial H1 despite fictitious H1s in comments and scripts', () => {
  assert.deepEqual(checkPage(html('/products') + '<!-- <h1>Invisible</h1> --><script>const example = "<h1>Invisible</h1>";</script>', '/products'), []);
});

test('rejects unsafe schema variant links and allows only the exact local GET target', () => {
  const path = '/products/tee';
  const valid = origin + path + '?variant=22';
  assert.equal(allowedVariantAuditUrl(valid, path), true);
  for (const value of [
    origin + path + '?variant=022', origin + path + '?variant=0', origin + path + '?variant=22&utm_source=x',
    origin + path + '?variant=22#x', origin + '/products/other?variant=22',
    'https://evil.test/products/tee?variant=22', 'https://user:pass@www.funnyteesforall.com/products/tee?variant=22',
    origin + path + '?variant=9007199254740992'
  ]) assert.equal(allowedVariantAuditUrl(value, path), false, value);
  assert.equal(allowedAuditUrl('http://127.0.0.1:3210/products/tee?variant=22'), true);
  assert.equal(allowedAuditUrl('http://127.0.0.1:3210/products/tee?variant=022'), false);
  assert.equal(allowedAuditUrl('http://127.0.0.1:3210/products/tee?variant=22&utm_source=x'), false);
});

const group = (entries = [
  { id: '11', price: '29.00', image: 'https://example.com/black.webp' },
  { id: '22', price: '31.00', image: 'https://example.com/blue.webp' }
]) => ({ '@type': 'ProductGroup', hasVariant: entries.map(({ id, price, image }) => ({
  '@type': 'Product', sku: id, image, url: origin + '/products/tee?variant=' + id,
  offers: { '@type': 'Offer', url: origin + '/products/tee?variant=' + id, price, priceCurrency: 'USD' }
})) });
const productHtml = (schema = group(), price = '$29.00', image = 'https://example.com/black.webp') =>
  html('/products/tee', 'Tee') + '<script type="application/ld+json">' + JSON.stringify(schema) + '</script>' +
  '<section class="ncc-gallery"><div class="ncc-gallery__main"><img alt="Main" src="' + image + '"></div></section>' +
  '<aside class="ncc-buybox"><p class="ncc-price">' + price + '</p></aside>';
const variantFetcher = ({ schema = group(), prices = { '11': '$29.00', '22': '$31.00' }, images = { '11': 'https://example.com/black.webp', '22': 'https://example.com/blue.webp' } } = {}) => async url => {
  const u = new URL(url); const path = u.pathname;
  if (path === '/sitemap.xml') return new Response('<urlset>' + ['/', '/products', '/privacy', '/cookies', '/products/tee'].map(p => '<url><loc>' + origin + p + '</loc></url>').join('') + '</urlset>');
  if (path === '/robots.txt') return new Response('Sitemap: ' + origin + '/sitemap.xml');
  if (path === '/products/seo-smoke-nonexistent') return new Response('<meta name="robots" content="noindex">', { status: 404 });
  if (path === '/products/tee') {
    const id = u.searchParams.get('variant') || '11';
    return new Response(productHtml(schema, prices[id], images[id]));
  }
  return new Response(html(path) + (path === '/products' ? '<a href="/products/tee">T</a>' : '') + (['/admin', '/success', '/cancel'].includes(path) ? '<meta name="robots" content="noindex">' : ''));
};

test('samples at most two safe ProductGroup Offers and matches selected initial price and image', async () => {
  const requests = [];
  const schema = group([...group().hasVariant.map(v => ({ id: v.sku, price: v.offers.price, image: v.image })), { id: '33', price: '32.00', image: 'https://example.com/red.webp' }]);
  const fetcher = variantFetcher({ schema });
  const report = await runAudit('http://127.0.0.1:3210', async (url, options) => { requests.push({ url, options }); return fetcher(url, options); });
  assert.deepEqual(report.failures, []);
  assert.equal(report.ok, true);
  assert.deepEqual(report.variantSamples, ['/products/tee?variant=11', '/products/tee?variant=22']);
  assert.equal(requests.filter(r => r.url.includes('?variant=')).length, 2);
  assert.ok(requests.every(r => r.options.method === 'GET' && r.options.redirect === 'manual'));
  assert.ok(report.limitations.some(x => /capped at two/.test(x)));
});

test('fails if variant initial price or main gallery image differs from the exact Offer', async () => {
  const badPrice = await runAudit('http://localhost:3210', variantFetcher({ prices: { '11': '$29.00', '22': '$29.00' } }));
  assert.ok(badPrice.failures.some(x => /variant=22.*price/i.test(x)));
  const badImage = await runAudit('http://localhost:3210', variantFetcher({ images: { '11': 'https://example.com/black.webp', '22': 'https://example.com/black.webp' } }));
  assert.ok(badImage.failures.some(x => /variant=22.*image/i.test(x)));
});

test('rejects an unsafe ProductGroup Offer URL before requesting any variant', async () => {
  const schema = group(); schema.hasVariant[0].offers.url = 'https://evil.test/products/tee?variant=11';
  const requests = [];
  const fetcher = variantFetcher({ schema });
  const report = await runAudit('http://localhost:3210', async (url, options) => { requests.push(url); return fetcher(url, options); });
  assert.ok(report.failures.some(x => /unsafe variant offer/i.test(x)));
  assert.equal(requests.filter(x => x.includes('?variant=')).length, 0);
});
