# Printful stock registration implementation plan

> Execute inline with `superpowers:executing-plans`; one independent final review.

**Goal:** Register catalog product IDs for `stock_updated`, without replacing unrelated webhook configuration.
**Spec:** Owner-approved bounded stock fix in this conversation; Printful Webhooks API contract (https://developers.printful.com/docs/#tag/Webhooks-API).
**Architecture:** Keep the authenticated admin route and Firestore catalog model. Resolve its sync product IDs through Printful product details before registration. Preserve the existing webhook destination, secret, event types and unrelated params; fail closed on incomplete metadata or destination mismatch. New registration uses configured defaults.
**Stack:** Next.js, TypeScript, Vitest, Printful v1 API.

## Global constraints

- No orders, payments, manufacturing, product writes, secret rotation or Tax changes.
- Never log authenticated URLs or tokens. Do not publish process scratch files.
- Keep the primary dirty checkout intact; work from current main in the existing isolated worktree.
- A simulated event is not a genuine provider stock change. Leave genuine-event verification pending if none arrives.

## Task 1: Fix registration with regression coverage

**Files:** `src/lib/printful.ts`, `src/lib/printful.test.ts`, `src/lib/printful-webhook-route.test.ts`, `src/app/api/admin/printful/webhook/route.ts` (clarifying variable only).
**Interfaces:** Input remains sync product IDs from Firestore; output POST `/webhooks` contains deduplicated catalog IDs resolved from every non-ignored variant's `product.product_id`.

1. Add failing tests: sync-to-catalog mapping, multiple catalog models, duplicate IDs; preservation of URL/types/params; empty or malformed metadata, mismatched variant/product identity, API failure, mismatched destination and missing catalog must never POST. Also cover initial setup, repeat/no-op and auth before external calls.
2. Run `npx.cmd vitest run src/lib/printful.test.ts src/lib/printful-webhook-route.test.ts`.
   Expected: new regression cases fail against existing implementation.
3. Implement minimal resolution and safe registration. Accept Printful's observed empty `params: []`, reject malformed nonempty arrays. Bound metadata concurrency and deadline as in existing shipping checks.
4. Repeat focused tests. Expected: all green.
5. Run tests, lint, TypeScript and build. Expected: all exit 0. Commit only scoped code/tests/docs.

## Task 2: Review, integrate and verify provider state

**Interfaces:** Consume task 1's exact verified commit; preserve remote subscription identity.

1. Independent whole-branch review; fix important findings with RED/GREEN tests.
2. Audit all PRs, branches and worktrees. Push branch, create/reuse PR, verify exact head and Vercel preview, merge normally, verify main and production.
3. Read provider registration, apply only stock subscription correction through deployed authenticated route, read it again. Expected: same URL/secret/other events/params and catalog IDs matching current products.
4. Read-only check for a fresh stock/product event. No forced product mutation. Document separately code/deployment, subscription and genuine-event evidence in checklist and verification report.

## Review focus

Check wrong identifier namespaces, incomplete or mixed-model products, ignored variants, malformed provider data, empty catalog, timeout/rate failure before writes, preservation of unrelated configuration and secrets, and whether genuine-event evidence is overstated. No catalog/schema/checkout changes belong here.
