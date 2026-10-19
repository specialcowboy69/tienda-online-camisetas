// Runs the real Google tag against a local build. All collection endpoints are
// intercepted in the browser: this never sends test events to Google Analytics.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => index % 2 ? pairs : [...pairs, [value, all[index + 1]]], []));
const base = new URL(args["--base-url"] ?? "http://127.0.0.1:3100");
assert(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Use a loopback server only");
assert(args["--module-root"], "Supply the Playwright module root");
const require = createRequire(join(resolve(args["--module-root"]), "ga4-real-check.cjs"));
const { chromium } = require("playwright");
const canonical = "https://www.funnyteesforall.com";
const id = "G-4JDZCBK8SY";
const key = "ncc.analytics-consent.v1";
const browser = await chromium.launch({ headless: true, ...(args["--channel"] ? { channel: args["--channel"] } : {}) });
const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
const traffic = { scripts: 0, hits: [], unexpected: [] };

await context.route("**/*", async route => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === canonical && ["GET", "HEAD"].includes(request.method()) && !url.pathname.startsWith("/api/")) {
    const upstream = new URL(url.pathname + url.search, base);
    try {
      const response = await route.fetch({ url: upstream.href, headers: { ...request.headers(), host: base.host }, maxRedirects: 0 });
      const headers = response.headers();
      if (headers.location?.startsWith(base.origin)) headers.location = headers.location.replace(base.origin, canonical);
      return route.fulfill({ response, headers });
    } catch (error) {
      traffic.unexpected.push(`loopback ${url.pathname}: ${error.message}`);
      return route.abort();
    }
  }
  if (url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js") {
    assert.equal(url.searchParams.get("id"), id);
    assert.equal(url.searchParams.get("l"), "nccAnalyticsLayer");
    traffic.scripts++;
    return route.continue();
  }
  if (url.hostname.endsWith("google-analytics.com") || url.hostname.endsWith("analytics.google.com") || url.hostname.endsWith("googletagmanager.com") || url.hostname.endsWith("google.com")) {
    traffic.hits.push({ host: url.hostname, path: url.pathname, params: Object.fromEntries(url.searchParams), body: request.postData() });
    return route.fulfill({ status: 204, body: "" });
  }
  if (request.resourceType() === "image") return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  traffic.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
  return route.abort("blockedbyclient");
});

async function settle(page) { await page.waitForTimeout(1200); }
async function visit(page, path) {
  await page.goto(canonical + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.getByRole("button", { name: "Cookie settings", exact: true }).waitFor();
  await settle(page);
}

try {
  const page = await context.newPage();
  await visit(page, "/?email=synthetic@example.invalid#secret");
  assert.equal(traffic.scripts, 0, "No script before a decision");
  assert.equal(traffic.hits.length, 0, "No collection before a decision");
  await page.getByRole("button", { name: "Reject analytics", exact: true }).click();
  await settle(page);
  assert.equal(traffic.scripts, 0, "No script after rejection");
  await page.getByRole("button", { name: "Cookie settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "Allow Google Analytics" }).setChecked(true);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await page.waitForFunction(() => !!document.querySelector("#ncc-ga4-script"));
  await settle(page);
  assert.equal(traffic.scripts, 1, "One real gtag script loads after acceptance");
  assert(traffic.hits.some(hit => hit.params.en === "page_view"), "The real SDK sends an intercepted page_view");
  const acceptedCount = traffic.hits.length;
  assert.equal(acceptedCount, 1, "Only the explicitly requested page_view is sent");
  assert.equal(traffic.hits[0].params.tid, id, "Collector targets the expected property");
  await page.evaluate(() => history.pushState({}, "", "/?order_id=synthetic"));
  await settle(page);
  if (traffic.hits.length !== acceptedCount) {
    const automatic = traffic.hits.slice(acceptedCount);
    console.error(JSON.stringify({ unexpectedAutomaticEvents: automatic.map(hit => hit.params.en ?? "other"), sensitiveQueryPresent: /order_id|synthetic/.test(JSON.stringify(automatic)) }));
  }
  assert.equal(traffic.hits.length, acceptedCount, "No automatic events beyond our explicit page_view");
  await page.evaluate(() => history.pushState({}, "", "/success?order_id=synthetic"));
  await settle(page);
  assert.equal(traffic.hits.length, acceptedCount, "No events on an excluded route");
  await page.getByRole("button", { name: "Cookie settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "Allow Google Analytics" }).setChecked(false);
  await page.getByRole("button", { name: "Save preferences" }).click();
  await settle(page);
  assert.equal(traffic.hits.length, acceptedCount, "Withdrawal sends no new collection requests");
  assert.equal(await page.evaluate(id => window[`ga-disable-${id}`], id), true, "SDK disabled after withdrawal");
  assert.equal((await context.cookies()).some(cookie => cookie.name.startsWith("ncc_ga")), false, "Owned analytics cookies removed");
  assert.equal(JSON.parse(await page.evaluate(key => localStorage.getItem(key), key)).choice, "denied");
  const allPayloads = JSON.stringify(traffic.hits);
  assert(!/synthetic|order_id|email=|secret/.test(allPayloads), "No sensitive query or test email reaches a collector");
  assert.deepEqual(traffic.unexpected, [], "No unrecognized external requests");
  console.log(JSON.stringify({ result: "PASS", realScriptRequests: traffic.scripts, interceptedCollectorRequests: acceptedCount, eventNames: traffic.hits.map(hit => hit.params.en ?? "other"), consentBeforeLoad: "denied", excludedRouteEvents: 0, analyticsCookiesAfterWithdrawal: 0 }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
