// Isolated browser verification. No requests reach Google or commercial APIs.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value, all[index + 1]]], []));
const base = new URL(args["--base-url"] ?? "http://127.0.0.1:3100");
assert(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) && !base.username && !base.password, "Only loopback servers permitted");
const output = resolve(args["--output"] ?? "output/playwright/ga4-consent");
const rel = relative(process.cwd(), output);
assert(rel && !rel.startsWith("..") && !isAbsolute(rel), "Output must be inside the checkout");
assert(args["--module-root"], "Supply the bundled Playwright module directory");
const require = createRequire(join(resolve(args["--module-root"]), "analytics-harness.cjs"));
const { chromium } = require("playwright");
const canonical = "https://www.funnyteesforall.com";
const key = "ncc.analytics-consent.v1";
const id = "G-4JDZCBK8SY";
const results = [];
const pending = [];
const forbidden = [];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(args["--channel"] ? { channel: args["--channel"] } : {}) });

// Deliberately limited SDK double: proves our commands/UI, not Google's SDK.
const fakeTag = `(() => {
  const layer = window.nccAnalyticsLayer;
  window.__analyticsCommands = window.__analyticsCommands || [];
  function consume(args) {
    const c = Array.from(args); window.__analyticsCommands.push(c);
    // The double models the initial automatic view from GA4 config, not
    // enhanced-measurement history events (those require the real SDK).
    if (c[0] === 'config' && c[2]?.send_page_view && !window['ga-disable-${id}']) {
      document.cookie='ncc_ga=simulated; Path=/; Secure; SameSite=Lax';
      document.cookie='ncc_ga_4JDZCBK8SY=simulated; Path=/; Secure; SameSite=Lax';
      fetch('https://www.google-analytics.com/g/collect', {method:'POST', body:JSON.stringify(c)});
    }
  }
  layer.forEach(consume);
  const original = layer.push;
  layer.push = function(...entries) { entries.forEach(consume); return original.apply(this, entries); };
})();`;
const blankImage = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#e7e1d8"/></svg>';

async function fixture(viewport, { storage, blockedStorage = false, tagError = false, delayTag = false } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const traffic = { scripts: 0, hits: [] };
  let release;
  const held = new Promise(r => { release = r; });
  await context.addInitScript(({ key, storage, blockedStorage }) => {
    if (storage !== undefined) localStorage.setItem(key, storage);
    if (blockedStorage) {
      Storage.prototype.getItem = () => { throw new Error("test storage denied"); };
      Storage.prototype.setItem = () => { throw new Error("test storage denied"); };
    }
  }, { key, storage, blockedStorage });
  await context.route("**/*", async route => {
    const req = route.request(); const url = new URL(req.url());
    if (url.origin === "https://www.googletagmanager.com" && url.pathname === "/gtag/js") {
      assert.equal(url.searchParams.get("id"), id); assert.equal(url.searchParams.get("l"), "nccAnalyticsLayer");
      traffic.scripts++;
      if (delayTag) await held;
      if (tagError) return route.abort("failed");
      return route.fulfill({ contentType: "application/javascript", body: fakeTag });
    }
    if (url.origin === "https://www.google-analytics.com" && url.pathname === "/g/collect") {
      traffic.hits.push(JSON.parse(req.postData() ?? "null"));
      return route.fulfill({ status: 204 });
    }
    if (url.origin === canonical && ["GET", "HEAD"].includes(req.method()) && !url.pathname.startsWith("/api/")) {
      if (url.pathname === "/_next/image") return route.fulfill({ contentType: "image/svg+xml", body: blankImage });
      const upstream = new URL(url.pathname + url.search, base);
      try {
        const response = await route.fetch({ url: upstream.href, headers: { ...req.headers(), host: base.host }, maxRedirects: 0 });
        const headers = response.headers();
        if (headers.location?.startsWith(base.origin)) headers.location = headers.location.replace(base.origin, canonical);
        return route.fulfill({ response, headers });
      } catch (error) { forbidden.push(`loopback failure: ${url.pathname}: ${error.message}`); return route.abort(); }
    }
    if (req.resourceType() === "image" && (url.hostname.endsWith(".r2.dev") || url.hostname.endsWith(".printful.com") || url.hostname === "media.urltovideo.es")) return route.fulfill({ contentType: "image/svg+xml", body: blankImage });
    forbidden.push(`${req.method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  return { context, page, traffic, release };
}
async function settle(page) { await page.waitForTimeout(250); }
async function visit(page, path = "/") { await page.goto(canonical + path); await page.getByRole("button", { name: "Cookie settings", exact: true }).waitFor(); await settle(page); }
async function settings(page) { await page.getByRole("button", { name: "Cookie settings", exact: true }).click(); await page.getByRole("dialog").waitFor(); }
async function save(page, granted) { await settings(page); await page.getByRole("checkbox", { name: "Allow Google Analytics" }).setChecked(granted); await page.getByRole("button", { name: "Save preferences" }).click(); await settle(page); }
async function countHits(page, traffic, count) { await page.waitForFunction(() => !!window.__analyticsCommands); await settle(page); assert.equal(traffic.hits.length, count); }
async function noOverflow(page) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); }
async function test(name, fn) { if (await fn() === false) { pending.push(name); console.log(`PENDING ${name}`); } else { results.push(name); console.log(`PASS ${name}`); } }

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    if (args["--mode"] === "off") {
      await test(`flag off ${viewport.width}`, async () => {
        const { page, context, traffic } = await fixture(viewport);
        await visit(page); assert.equal(await page.getByRole("button", { name: "Accept analytics" }).count(), 0);
        const footer = page.getByRole("contentinfo", { name: "Legal information" });
        assert.equal(await footer.getByRole("button", { name: "Cookie settings" }).evaluate(el => getComputedStyle(el).color), await footer.evaluate(el => getComputedStyle(el).color));
        await settings(page); assert.equal(await page.getByText("Analytics is currently off on this site.").isVisible(), true);
        await page.getByRole("button", { name: "Close cookie settings" }).click();
        for (const [path, heading] of [["/privacy", "Privacy policy"], ["/cookies", "Cookie policy"]]) {
          await page.getByRole("contentinfo", { name: "Legal information" }).getByRole("link", { name: heading }).click();
          await page.waitForURL(canonical + path);
          assert.equal(await page.getByRole("heading", { level: 1, name: heading }).isVisible(), true);
          await noOverflow(page);
          await page.screenshot({ path: join(output, `${path.slice(1)}-${viewport.width}.png`), fullPage: true });
        }
        assert.equal(traffic.scripts, 0); assert.equal(traffic.hits.length, 0); await context.close();
      });
      continue;
    }
    await test(`unknown/reject/keyboard/accept/navigation/withdraw ${viewport.width}`, async () => {
      const { page, context, traffic } = await fixture(viewport);
      await visit(page, "/?email=synthetic@example.invalid#private");
      const accept = page.getByRole("button", { name: "Accept analytics", exact: true });
      const reject = page.getByRole("button", { name: "Reject analytics", exact: true });
      await accept.waitFor(); await noOverflow(page);
      const a = await accept.boundingBox(), r = await reject.boundingBox();
      assert(a.height >= 44 && r.height >= 44); assert.equal(a.height, r.height);
      assert.equal(a.width, r.width, "Accept and reject must have equal dimensions");
      await page.screenshot({ path: join(output, `banner-${viewport.width}.png`) });
      assert.equal(traffic.scripts, 0);
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      assert.equal(await page.getByRole("checkbox").isChecked(), false);
      await page.getByRole("button", { name: "Close cookie settings" }).focus(); await page.keyboard.press("Shift+Tab");
      assert.equal(await page.getByRole("button", { name: "Cancel", exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Tab"); assert.equal(await page.getByRole("button", { name: "Close cookie settings" }).evaluate(el => el === document.activeElement), true);
      await page.screenshot({ path: join(output, `settings-${viewport.width}.png`) });
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("button", { name: "Settings", exact: true }).evaluate(el => el === document.activeElement), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
      await reject.click(); await page.reload(); await settle(page);
      assert.equal(traffic.scripts, 0); assert.equal(traffic.hits.length, 0);
      await save(page, true); await countHits(page, traffic, 1);
      await page.evaluate(() => history.pushState({}, "", "/?order_id=private#secret")); await settle(page); assert.equal(traffic.hits.length, 1);
      await page.locator('a[href="/products"]').first().click(); await page.waitForURL("**/products"); await settle(page);
      await page.locator('a[href="/"]').first().click(); await page.waitForURL(canonical + "/"); await settle(page);
      assert.equal(traffic.hits.length, 1, "The double does not model GA4 history events");
      assert.equal(await page.evaluate(() => window.__analyticsCommands.filter(command => command[0] === "event" && command[1] === "page_view").length), 0);
      await save(page, false); assert.equal(traffic.hits.length, 1);
      assert.equal((await context.cookies()).some(c => c.name.startsWith("ncc_ga")), false);
      await save(page, true); await countHits(page, traffic, 2); assert.equal(traffic.scripts, 1);
      await page.evaluate(() => history.pushState({}, "", "/success?order_id=private")); await settle(page);
      assert.equal(await page.evaluate(id => window[`ga-disable-${id}`], id), true); assert.equal(traffic.hits.length, 2);
      assert(!JSON.stringify(traffic.hits).match(/synthetic|private|order_id|email=|secret/));
      await context.close();
    });
  }
  if (args["--mode"] !== "off") {
    const viewport = { width: 390, height: 844 };
    await test("late script completion after withdrawal", async () => {
      const { page, context, traffic, release } = await fixture(viewport, { delayTag: true });
      await visit(page); await page.getByRole("button", { name: "Accept analytics" }).click();
      await settle(page); assert.equal(traffic.scripts, 1); await save(page, false); release(); await settle(page);
      assert.equal(traffic.hits.length, 0); await context.close();
    });
    await test("script failure has no render retry", async () => {
      const { page, context, traffic } = await fixture(viewport, { tagError: true });
      await visit(page); await page.getByRole("button", { name: "Accept analytics" }).click(); await settle(page);
      await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await settle(page);
      assert.equal(traffic.scripts, 1); assert.equal(traffic.hits.length, 0);
      await save(page, true); assert.equal(traffic.scripts, 2); await context.close();
    });
    for (const storage of ["broken", JSON.stringify({ version: 1, choice: "granted", decidedAt: Date.now() + 86400000 }), JSON.stringify({ version: 1, choice: "granted", decidedAt: Date.now() - 15552000001 }), JSON.stringify({ version: 1, choice: "denied", decidedAt: Date.now() })]) {
      await test(`invalid/denied preference ${results.length}`, async () => {
        const { page, context, traffic } = await fixture(viewport, { storage }); await visit(page);
        assert.equal(traffic.scripts, 0); assert.equal(traffic.hits.length, 0);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), storage.includes('"denied"') ? storage : null);
        await context.close();
      });
    }
    await test("blocked storage uses memory and visible warning", async () => {
      const { page, context, traffic } = await fixture(viewport, { blockedStorage: true }); await visit(page);
      assert.equal(traffic.scripts, 0); await page.getByRole("button", { name: "Accept analytics" }).click(); await countHits(page, traffic, 1);
      await settings(page); assert.equal(await page.getByRole("dialog").getByRole("status").isVisible(), true);
      await page.keyboard.press("Escape"); await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await settle(page);
      assert.equal(traffic.hits.length, 1); await save(page, false); assert.equal(traffic.hits.length, 1); await context.close();
    });
    await test("other tab revokes and invalid storage cannot restore permission", async () => {
      const { page, context, traffic } = await fixture(viewport); await visit(page); await save(page, true); await countHits(page, traffic, 1);
      const second = await context.newPage(); await visit(second); await countHits(second, traffic, 2);
      await save(second, false); await settle(page); assert.equal(await page.evaluate(id => window[`ga-disable-${id}`], id), true);
      await second.evaluate(key => localStorage.setItem(key, "broken"), key); await settle(page);
      await page.evaluate(() => window.dispatchEvent(new Event("focus"))); await settle(page);
      assert.equal(traffic.hits.length, 2); await context.close();
    });
    await test("stale storage acceptance cannot override current rejection", async () => {
      const { page, context, traffic } = await fixture(viewport); await visit(page); await save(page, true); await countHits(page, traffic, 1);
      const oldGrant = await page.evaluate(key => localStorage.getItem(key), key);
      await save(page, false);
      await page.evaluate(({ key, oldGrant }) => window.dispatchEvent(new StorageEvent("storage", { key, newValue: oldGrant, storageArea: localStorage })), { key, oldGrant });
      await settle(page);
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).choice, key), "denied");
      assert.equal(await page.evaluate(id => window[`ga-disable-${id}`], id), true);
      assert.equal(traffic.hits.length, 1);
      assert.equal((await context.cookies()).some(c => c.name.startsWith("ncc_ga")), false);
      // A storage notification must also fail closed when the latest record cannot be read.
      await page.evaluate(({ key, oldGrant }) => {
        Storage.prototype.getItem = () => { throw new Error("test storage denied"); };
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: oldGrant, storageArea: localStorage }));
      }, { key, oldGrant });
      await settle(page);
      assert.equal(await page.evaluate(id => window[`ga-disable-${id}`], id), true);
      assert.equal(traffic.hits.length, 1); await context.close();
    });
    await test("expired permission blocks an already open page", async () => {
      const now = Date.now();
      const { page, context, traffic } = await fixture(viewport, { storage: JSON.stringify({ version: 1, choice: "granted", decidedAt: now - 15552000000 + 5000 }) });
      await page.clock.install({ time: new Date(now) }); await visit(page); await countHits(page, traffic, 1);
      await page.clock.fastForward(6000); await settle(page);
      assert.equal(await page.evaluate(id => window[`ga-disable-${id}`], id), true); assert.equal(traffic.hits.length, 1); await context.close();
    });
    for (const path of ["/success?order_id=synthetic", "/cancel", "/admin", "/products/does-not-exist"]) {
      await test(`excluded ${path.split("?")[0]}`, async () => {
        const { page, context, traffic } = await fixture(viewport, { storage: JSON.stringify({ version: 1, choice: "granted", decidedAt: Date.now() }) }); await visit(page, path);
        assert.equal(traffic.scripts, 0); assert.equal(traffic.hits.length, 0); await context.close();
      });
    }
    await test("PDP registration and preserving user form state", async () => {
      const { page, context, traffic } = await fixture(viewport);
      const response = await page.goto(canonical + "/products/falling-apart-cat-graphic-tee"); await settle(page);
      if (response.status() !== 200 || await page.getByRole("button", { name: "Add to bag", exact: true }).first().isDisabled()) {
        await context.close(); return false;
      }
      await page.getByRole("button", { name: "Reject analytics" }).click();
      await page.getByRole("button", { name: "Add to bag", exact: true }).first().click();
      const email = page.locator('input[type="email"]').first(); await email.fill("synthetic@example.invalid");
      await save(page, true); await countHits(page, traffic, 1); await save(page, false);
      assert.equal(await email.inputValue(), "synthetic@example.invalid"); assert(!JSON.stringify(traffic.hits).includes("synthetic")); await context.close();
    });
  }
  assert.deepEqual(forbidden, [], "All traffic must stay inside the explicit interception boundary");
  await writeFile(join(output, `summary-${args["--mode"] ?? "enabled"}.json`), JSON.stringify({ mode: args["--mode"] ?? "enabled", passed: results, pending, realGoogleTraffic: false, forbidden }, null, 2));
} finally { if (forbidden.length) console.error(forbidden); await browser.close(); }
