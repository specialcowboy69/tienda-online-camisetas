# Urgent Hardening Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the existing storefront by authenticating the Printful webhook, bounding unauthenticated public API cost, and updating vulnerable dependencies without a risky rewrite.

**Architecture:** Keep the current Next.js App Router architecture. Add small reusable server-side helpers in `src/lib` only where the same control is needed by multiple routes, and keep route handlers thin. Prefer tests around pure helpers and route/service behavior over broad UI rewrites.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Admin/Firestore, Stripe, Printful API, Resend, Zod, Vitest, ESLint, npm.

**Spec:** Current user request in this conversation: implement only webhook protection, public endpoint abuse limits, and cautious dependency updates. Do not include secret/key rotation in this plan.

## Global Constraints

- Do not rotate, print, remove, or edit real secrets in `.env.local`.
- Do not rewrite the app architecture.
- Do not add a new dependency unless the same result is not reasonable with current Next.js, Web APIs, Node.js, Zod, or existing dependencies.
- Keep changes incremental and reversible.
- Every non-trivial behavior change must have one small runnable check.
- Use existing patterns: thin `src/app/api/**/route.ts` handlers, shared logic in `src/lib`, Vitest tests under `src/lib/*.test.ts`.
- Final verification for the whole plan: `npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, and `npm.cmd run build`.

---

## File Structure

- Modify `src/lib/env.ts`: add non-secret configuration accessors for webhook/rate-limit settings if needed.
- Modify `src/lib/validation.ts`: add maximum lengths to public request fields.
- Create `src/lib/rate-limit.ts`: small in-memory fixed-window limiter for public API routes.
- Create `src/lib/rate-limit.test.ts`: unit tests for limiter behavior.
- Modify `src/app/api/shipping/rates/route.ts`: apply rate limit before calling Printful.
- Modify `src/app/api/checkout/route.ts`: apply stricter rate limit before Firestore/Stripe/Printful work.
- Modify `src/app/api/webhooks/printful/route.ts`: authenticate webhook before processing and validate payload shape.
- Create `src/lib/printful-webhook.test.ts` or `src/app/api/webhooks/printful/route.test.ts`: tests for webhook auth and payload handling. Prefer `src/lib/printful-webhook.test.ts` if extracting pure helpers; otherwise test the route with mocked dependencies.
- Modify `package.json` and `package-lock.json`: update dependencies cautiously.

---

### Task 1: Add Printful Webhook Authentication And Payload Validation

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/app/api/webhooks/printful/route.ts`
- Test: `src/lib/printful-webhook.test.ts`

**Interfaces:**
- Consumes: `env.PRINTFUL_STORE_ID`
- Produces:
  - `getPrintfulWebhookSecret(): string | undefined`
  - `isAuthorizedPrintfulWebhook(request: NextRequest): boolean`
  - `printfulWebhookPayloadSchema`
  - `parsePrintfulWebhookPayload(input: unknown): PrintfulWebhookPayload`

- [ ] **Step 1: Add a failing test for missing webhook secret**

Create `src/lib/printful-webhook.test.ts` with a helper-level test before changing route behavior:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";

describe("Printful webhook protection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects webhook requests when the configured secret is missing from the request", async () => {
    vi.stubEnv("PRINTFUL_WEBHOOK_SECRET", "strong-test-secret");
    const { isPrintfulWebhookSecretValid } = await import("./printful-webhook");

    expect(isPrintfulWebhookSecretValid(null)).toBe(false);
    expect(isPrintfulWebhookSecretValid("wrong")).toBe(false);
    expect(isPrintfulWebhookSecretValid("strong-test-secret")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npx.cmd vitest run --environment node src/lib/printful-webhook.test.ts
```

Expected: FAIL because `src/lib/printful-webhook.ts` does not exist.

- [ ] **Step 3: Add the minimal helper**

Create `src/lib/printful-webhook.ts`:

```ts
import { z } from "zod";
import { env } from "./env";

export const printfulWebhookPayloadSchema = z.object({
  type: z.string().min(1).max(80),
  created: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  store: z.number().int().nonnegative(),
  data: z
    .object({
      order: z
        .object({
          id: z.number().int().optional(),
          external_id: z.string().max(128).optional(),
          status: z.string().max(80).optional()
        })
        .optional(),
      shipment: z
        .object({
          id: z.number().int().optional(),
          carrier: z.string().max(80).optional(),
          service: z.string().max(80).optional(),
          tracking_number: z.string().max(120).optional(),
          tracking_url: z.string().url().max(500).optional()
        })
        .optional(),
      sync_product: z
        .object({
          id: z.number().int().optional(),
          external_id: z.string().max(128).optional(),
          name: z.string().max(200).optional()
        })
        .optional(),
      product_id: z.number().int().optional(),
      reason: z.string().max(500).optional()
    })
    .optional()
});

export type PrintfulWebhookPayload = z.infer<typeof printfulWebhookPayloadSchema>;

export function isPrintfulWebhookSecretValid(value: string | null): boolean {
  return Boolean(env.PRINTFUL_WEBHOOK_SECRET && value === env.PRINTFUL_WEBHOOK_SECRET);
}

export function parsePrintfulWebhookPayload(input: unknown): PrintfulWebhookPayload {
  return printfulWebhookPayloadSchema.parse(input);
}
```

Also add `PRINTFUL_WEBHOOK_SECRET: z.string().optional()` to `src/lib/env.ts`.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npx.cmd vitest run --environment node src/lib/printful-webhook.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add failing route-level behavior test**

Extend `src/lib/printful-webhook.test.ts`:

```ts
it("parses valid payloads and rejects invalid tracking URLs", async () => {
  vi.stubEnv("PRINTFUL_WEBHOOK_SECRET", "strong-test-secret");
  const { parsePrintfulWebhookPayload } = await import("./printful-webhook");

  expect(() =>
    parsePrintfulWebhookPayload({
      type: "package_shipped",
      created: 123,
      retries: 0,
      store: 18536834,
      data: {
        shipment: {
          tracking_url: "javascript:alert(1)"
        }
      }
    })
  ).toThrow();
});
```

- [ ] **Step 6: Wire the helper into the route**

Modify `src/app/api/webhooks/printful/route.ts`:

```ts
import { isPrintfulWebhookSecretValid, parsePrintfulWebhookPayload, PrintfulWebhookPayload } from "@/lib/printful-webhook";
```

At the start of `POST`, before processing the body:

```ts
if (!isPrintfulWebhookSecretValid(request.headers.get("x-printful-webhook-secret"))) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

const payload = parsePrintfulWebhookPayload(await request.json());
```

Remove the local `type PrintfulWebhookPayload = ...` definition from the route after importing the shared type.

- [ ] **Step 7: Update webhook configuration to include the secret**

Modify `src/lib/printful.ts` so `configurePrintfulWebhook` can accept a prebuilt URL with a secret query string if Printful cannot send custom headers. Prefer a secret query parameter because the current admin route only registers a URL:

```ts
export function appendWebhookSecret(url: string, secret?: string): string {
  if (!secret) {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set("secret", secret);
  return parsed.toString();
}
```

Then update the route auth check to accept either:

```ts
const suppliedSecret = request.headers.get("x-printful-webhook-secret") || request.nextUrl.searchParams.get("secret");
```

And update `src/app/api/admin/printful/webhook/route.ts` to pass the secret-appended URL to Printful. Do not log or return the full URL with secret to the browser; return the base URL only.

- [ ] **Step 8: Run all webhook-focused tests**

Run:

```powershell
npx.cmd vitest run --environment node src/lib/printful-webhook.test.ts src/lib/printful.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/lib/env.ts src/lib/printful-webhook.ts src/lib/printful-webhook.test.ts src/lib/printful.ts src/app/api/webhooks/printful/route.ts src/app/api/admin/printful/webhook/route.ts
git commit -m "fix: protect Printful webhook"
```

---

### Task 2: Add Public API Abuse Limits

**Files:**
- Create: `src/lib/rate-limit.ts`
- Test: `src/lib/rate-limit.test.ts`
- Modify: `src/lib/validation.ts`
- Modify: `src/app/api/shipping/rates/route.ts`
- Modify: `src/app/api/checkout/route.ts`

**Interfaces:**
- Produces:
  - `rateLimit(key: string, options: { limit: number; windowMs: number; now?: number }): { allowed: boolean; remaining: number; resetAt: number }`
  - `getClientIp(request: NextRequest): string`
  - `rateLimitResponse(resetAt: number): NextResponse`

- [ ] **Step 1: Add failing limiter tests**

Create `src/lib/rate-limit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows requests up to the limit inside a window", () => {
    expect(rateLimit("checkout:1.2.3.4", { limit: 2, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(rateLimit("checkout:1.2.3.4", { limit: 2, windowMs: 1000, now: 200 }).allowed).toBe(true);
    expect(rateLimit("checkout:1.2.3.4", { limit: 2, windowMs: 1000, now: 300 }).allowed).toBe(false);
  });

  it("resets after the window", () => {
    expect(rateLimit("shipping:5.6.7.8", { limit: 1, windowMs: 1000, now: 100 }).allowed).toBe(true);
    expect(rateLimit("shipping:5.6.7.8", { limit: 1, windowMs: 1000, now: 1200 }).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npx.cmd vitest run --environment node src/lib/rate-limit.test.ts
```

Expected: FAIL because `src/lib/rate-limit.ts` does not exist.

- [ ] **Step 3: Implement a minimal in-memory limiter**

Create `src/lib/rate-limit.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

export function rateLimit(
  key: string,
  options: { limit: number; windowMs: number; now?: number }
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = options.now ?? Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + options.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: options.limit - 1, resetAt };
  }

  if (existing.count >= options.limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: options.limit - existing.count, resetAt: existing.resetAt };
}

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitResponse(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)))
      }
    }
  );
}
```

- [ ] **Step 4: Run limiter tests**

Run:

```powershell
npx.cmd vitest run --environment node src/lib/rate-limit.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add string length validation**

Modify `src/lib/validation.ts`:

```ts
export const recipientSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional(),
  address1: z.string().min(3).max(200),
  address2: z.string().max(200).optional(),
  city: z.string().min(2).max(120),
  stateCode: z.string().max(80).optional(),
  countryCode: z.string().length(2).transform((value) => value.toUpperCase()),
  zip: z.string().min(2).max(40)
});

export const cartItemSchema = z.object({
  productId: z.string().min(1).max(128),
  syncVariantId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100)
});

export const checkoutRequestSchema = shippingRatesRequestSchema.extend({
  shippingRateId: z.string().min(1).max(120)
});
```

- [ ] **Step 6: Apply rate limits to shipping rates**

Modify `src/app/api/shipping/rates/route.ts`:

```ts
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
```

At the top of `POST`:

```ts
const limited = rateLimit(`shipping:${getClientIp(request)}`, { limit: 30, windowMs: 60_000 });
if (!limited.allowed) {
  return rateLimitResponse(limited.resetAt);
}
```

- [ ] **Step 7: Apply stricter rate limits to checkout**

Modify `src/app/api/checkout/route.ts`:

```ts
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
```

At the top of `POST`:

```ts
const limited = rateLimit(`checkout:${getClientIp(request)}`, { limit: 10, windowMs: 60_000 });
if (!limited.allowed) {
  return rateLimitResponse(limited.resetAt);
}
```

- [ ] **Step 8: Run validation and limiter tests**

Run:

```powershell
npx.cmd vitest run --environment node src/lib/rate-limit.test.ts src/lib/checkout-calculator.test.ts src/lib/http.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/lib/rate-limit.ts src/lib/rate-limit.test.ts src/lib/validation.ts src/app/api/shipping/rates/route.ts src/app/api/checkout/route.ts
git commit -m "fix: limit public checkout API abuse"
```

---

### Task 3: Update Dependencies Cautiously

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: current `package.json`, `package-lock.json`, npm audit output.
- Produces: updated dependency tree that passes tests, lint, typecheck, build, and has fewer production advisories.

- [ ] **Step 1: Capture current advisory state**

Run:

```powershell
npm.cmd audit --omit=dev
```

Expected: current output includes production advisories. Save the important package names in the implementation notes for the commit or PR, not in code.

- [ ] **Step 2: Try non-breaking audit fix first**

Run:

```powershell
npm.cmd audit fix --omit=dev
```

Expected: npm updates only compatible dependency ranges and modifies `package-lock.json` when possible.

- [ ] **Step 3: Run full verification after non-breaking updates**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: all pass. If `tsc` fails only because Task 1 or Task 2 has not yet fixed the pre-existing `email.test.ts` readonly fixture issue, fix that test fixture in the smallest possible way before continuing:

```ts
import { StoreOrder } from "./types";

const order: StoreOrder = {
  // same fields as existing fixture
};
```

- [ ] **Step 4: Re-run audit**

Run:

```powershell
npm.cmd audit --omit=dev
```

Expected: fewer or zero production advisories. If advisories remain and npm proposes `--force`, do not run it automatically.

- [ ] **Step 5: Evaluate direct dependency upgrades manually**

If advisories remain for direct packages, prefer targeted install commands:

```powershell
npm.cmd install next@latest firebase-admin@latest stripe@latest zod@latest
```

Only keep this change if the app still passes:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: PASS. If Next major upgrade breaks API/runtime assumptions, revert only the dependency update from this task and document the blocker.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json
git commit -m "chore: update vulnerable dependencies"
```

---

### Task 4: Final Hardening Verification

**Files:**
- No new files.
- Verify all files changed by Tasks 1-3.

**Interfaces:**
- Consumes: all previous task outputs.
- Produces: final confidence that the hardened app still builds and critical controls are covered.

- [ ] **Step 1: Run all tests**

Run:

```powershell
npm.cmd test
```

Expected: PASS, including new tests added to the `test` script. If new tests are not listed in `package.json`, update the script to include them:

```json
"test": "vitest run --environment node src/lib/checkout-calculator.test.ts src/lib/email.test.ts src/lib/http.test.ts src/lib/money.test.ts src/lib/printful.test.ts src/lib/printful-webhook.test.ts src/lib/rate-limit.test.ts"
```

- [ ] **Step 2: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: 0 errors. The existing `<img>` warning may remain if this plan did not touch image rendering.

- [ ] **Step 3: Run TypeScript**

Run:

```powershell
npx.cmd tsc --noEmit --incremental false
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: PASS.

- [ ] **Step 5: Check final diff**

Run:

```powershell
git diff --stat
git diff -- src/app/api/webhooks/printful/route.ts src/app/api/shipping/rates/route.ts src/app/api/checkout/route.ts src/lib/validation.ts src/lib/rate-limit.ts src/lib/printful-webhook.ts package.json
```

Expected: diff is limited to webhook protection, rate limiting/validation, tests, and dependency files.

- [ ] **Step 6: Commit or report final state**

If previous tasks were not committed individually:

```powershell
git add src package.json package-lock.json
git commit -m "fix: harden storefront webhooks and public APIs"
```

If commits already exist, report the commit list and verification results.

---

## Self-Review

- Spec coverage: webhook protection is Task 1, endpoint abuse limiting is Task 2, cautious dependency updates are Task 3, final verification is Task 4.
- Excluded by request: rotating real secrets and keys is deliberately not included.
- Dependency discipline: no new dependency is planned for webhook secret checks, payload validation, or rate limiting.
- Known limitation: the in-memory limiter is suitable as a first guard for a small Vercel app, but it is per runtime instance. If traffic grows or deployment has many instances, replace it with a shared store such as Vercel KV, Upstash Redis, or another managed rate-limit backend.
- Type consistency: new helpers are defined before route tasks consume them.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-30-urgent-hardening.md`. Two execution options:

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
