# Stripe Checkout Address Compatibility Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Use `superpowers:test-driven-development` for Tasks 2-4, `superpowers:requesting-code-review` for Task 6, and `superpowers:verification-before-completion` before every completion claim. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept the current Stripe Checkout shipping-address payload without weakening the existing payment and address checks, keep compatibility with legacy Stripe events, deploy the fix through a reviewed PR, and prove it with one new safe Stripe test order.

**Architecture:** Normalize the address at the existing paid-checkout validation boundary. Prefer Stripe's current `session.collected_information.shipping_details.address`; fall back to top-level `session.shipping_details.address` only when the current address is absent. All amount, currency, PaymentIntent, session identity, required-field, material-address, refund, fulfillment, and idempotency protections remain unchanged. The historical order already in `manual_review` is evidence only and must not be retried or reopened by this patch.

**Tech Stack:** Next.js 15, TypeScript, Stripe SDK 17.7.0, Vitest, Firestore, Vercel, PowerShell.

**Root cause evidence:** A real Stripe test event using the endpoint's current payload shape stored the delivery address under `collected_information.shipping_details.address`. `src/lib/checkout-validation.ts` reads only the legacy top-level field, so the order was placed in `manual_review` with `ShippingAddressMissing`. The installed Stripe types already support both shapes; no dependency or API-version change is required.

## Scope and safety constraints

- Do not edit the stale/dirty checkout or its untracked `docs/LAUNCH_CHECKLIST.md` and `docs/superpowers/` content except for this plan file.
- Start implementation from a freshly fetched `origin/main` in an isolated worktree and branch `codex/stripe-checkout-address-compatibility`.
- Do not change Stripe, Vercel, Firestore, email, fulfillment-provider, tax, or secret configuration.
- Do not update dependencies or regenerate `package-lock.json`.
- Never copy a real customer's PII into fixtures, logs, commits, or PR text. Fixtures use synthetic names and addresses.
- Do not retry, reopen, fulfill, email, refund, or otherwise mutate the historical order that exposed the bug.
- A current nested address takes precedence over a legacy address. If the current address object is present but incomplete or materially different, validation must fail rather than silently using a convenient legacy value.
- The only accepted external side effects are from the final guarded test: one new Stripe test checkout/order, one unconfirmed fulfillment draft, and the existing transactional test-email behavior. Abort if Stripe is live or fulfillment confirmation is enabled.

---

## Task 1: Establish an isolated, current implementation base

**Files:**
- Read: `AGENTS.md`
- Read: `docs/operations.md`
- Preserve: `docs/LAUNCH_CHECKLIST.md`
- Preserve: `docs/superpowers/`

- [ ] Inventory the shared repository before writes:

```powershell
git status --short --branch
git worktree list --porcelain
git branch --all --verbose --no-abbrev
git fetch origin --prune
git rev-parse origin/main
```

- [ ] Check GitHub for open PRs and compare all `codex/*` branches/worktrees with the freshly fetched `origin/main`. Record blockers; do not merge unrelated work into this fix.
- [ ] Create an isolated worktree from the verified `origin/main` with branch `codex/stripe-checkout-address-compatibility`.
- [ ] Confirm the new worktree is clean and based on the fetched `origin/main` SHA.

**Stop condition:** Any unresolved PR/branch that changes checkout validation, order processing, Stripe webhooks, or the same tests; an unclear base SHA; or any need to disturb the dirty checkout.

## Task 2: Add the exact current-payload regression first (RED)

**Files:**
- Modify: `src/lib/checkout-validation.test.ts`
- Read: `node_modules/stripe/types/Checkout/Sessions.d.ts`

- [ ] Extract a synthetic reusable shipping address matching the stored order; do not paste the real webhook payload.
- [ ] Add a `currentSession` fixture with the address only at:

```ts
collected_information: {
  shipping_details: {
    name: "Ada",
    address: {
      line1: "1 Main St",
      line2: "Apt 2",
      city: "New York",
      state: "NY",
      country: "US",
      postal_code: "10001"
    }
  }
}
```

- [ ] Add one focused test asserting that `evaluatePaidCheckout` accepts this current-only shape and records normal validation evidence.
- [ ] Run only the new regression and capture the expected failure:

```powershell
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/checkout-validation.test.ts
```

**Expected RED:** the current-only session returns `valid: false` with `ShippingAddressMissing`.

- [ ] If it passes before the implementation change or fails for a different reason, stop and correct the fixture/test before touching production code.

## Task 3: Define compatibility, precedence, and a bounded service-flow regression (RED)

**Files:**
- Modify: `src/lib/checkout-validation.test.ts`
- Modify: `src/lib/order-service.test.ts`

- [ ] Preserve an explicit legacy-only session test so old webhook snapshots remain supported.
- [ ] Add a compact table covering:
  - current-only matching address -> valid;
  - legacy-only matching address -> valid;
  - current field absent/null/address absent plus valid legacy address -> valid fallback;
  - both addresses absent -> `ShippingAddressMissing`;
  - current address object present but missing a required field while legacy is complete -> `ShippingAddressMissing`;
  - current address changed while legacy matches -> `ShippingAddressChanged`;
  - current address matches while legacy differs -> valid, proving current-field precedence;
  - both addresses match -> valid.
- [ ] Keep existing checks for missing stored fields, material `line2` changes, amount, currency, PaymentIntent, session identity, immutable snapshot, refund holds, and blocked statuses.
- [ ] Add one focused service test that sends a current-only paid Checkout Session through `handleStripeWebhook` with mocked external transports. It must assert the order has no validation error, contains checkout evidence, reaches one unconfirmed fulfillment draft, and sends `address2` once.
- [ ] Do not replace the shared integration fixture during RED: the pre-fix validation return would prevent concurrency signals expected by unrelated tests and could turn the intended assertion failure into a timeout.
- [ ] Run the unit regression and the single focused service test by name. Confirm the unit reports `ShippingAddressMissing` and the service assertion exposes the persisted `ShippingAddressMissing` review state before production code changes:

```powershell
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/checkout-validation.test.ts
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/order-service.test.ts -t "processes current Stripe shipping details"
```

## Task 4: Implement the smallest safe normalizer (GREEN)

**Files:**
- Modify: `src/lib/checkout-validation.ts` at the existing address extraction in `evaluatePaidCheckout`

- [ ] Replace the legacy-only read with current-first, legacy-fallback resolution:

```ts
const address =
  session.collected_information?.shipping_details?.address ??
  session.shipping_details?.address;
```

- [ ] Do not change the required-field guard, `addressesMateriallyMatch`, evidence format/version, amount/currency checks, or fulfillment eligibility.
- [ ] Run the focused validation tests and confirm green:

```powershell
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/checkout-validation.test.ts
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/order-service.test.ts -t "processes current Stripe shipping details"
```

- [ ] Perform the TDD mutation check: temporarily restore the legacy-only line, confirm the new current-only test fails with `ShippingAddressMissing`, then reapply the implementation and confirm green. Do not commit the temporary mutation.

## Task 5: Run the transaction-safety regression sweep

**Files:**
- Modify: `src/lib/order-safety.integration.test.ts`
- Verify: `src/lib/order-service.test.ts`
- Verify: `src/lib/admin-order-routes.test.ts`
- Verify: `src/lib/refund-service.test.ts`

- [ ] Change the synthetic end-to-end Checkout Session fixture in `order-safety.integration.test.ts` to current-only `collected_information.shipping_details.address` now that the production fix is green.
- [ ] Keep its synthetic apartment line and confirm the updated existing full-flow scenario proves:
  - checkout evidence is persisted;
  - one fulfillment draft is created, never two;
  - the complete address reaches the fulfillment request;
  - email failure/recovery remains durable and idempotent.
- [ ] Run the transaction-safety subset:

```powershell
npx.cmd vitest run --environment node --testTimeout 15000 src/lib/checkout-validation.test.ts src/lib/order-service.test.ts src/lib/admin-order-routes.test.ts src/lib/refund-service.test.ts src/lib/order-safety.integration.test.ts
```

## Task 6: Complete verification and independent review

**Files:**
- Review: all branch changes
- Do not commit: `.superpowers/`, local env files, `.vercel/`, logs, screenshots, or temporary scripts

- [ ] Run the mandatory project checks from the isolated worktree:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit --omit=dev
```

- [ ] Treat a pre-existing audit finding separately; do not use `npm audit fix --force` and do not alter dependencies in this patch.
- [ ] Inspect `git diff --check`, `git diff --stat`, `git status --short`, and the complete diff.
- [ ] Request an independent code review focused on:
  - current-versus-legacy precedence;
  - no bypass from an incomplete current address to legacy data;
  - preservation of amount, identity, refund, idempotency, and fulfillment gates;
  - regression-test quality and absence of real PII.
- [ ] Resolve every valid finding and rerun all affected targeted tests plus the complete mandatory checks.

## Task 7: Commit, PR, checks, and merge safely

**Files:**
- Commit only the production/test files changed by Tasks 2-5
- Exclude: `docs/superpowers/` and every unrelated/untracked file

- [ ] Re-run the repository-wide pending-work inventory immediately before delivery: open PRs, unmerged remote branches, dirty worktrees, and unpushed commits. Stop on overlapping checkout/order work.
- [ ] Commit with a narrow message, for example:

```powershell
git add -- src/lib/checkout-validation.ts src/lib/checkout-validation.test.ts src/lib/order-safety.integration.test.ts
git commit -m "fix: accept current Stripe checkout addresses"
```

- [ ] Push `codex/stripe-checkout-address-compatibility` and create a PR against `main` describing root cause, current-first precedence, legacy fallback, red/green evidence, and the old-order non-retry constraint.
- [ ] Attach the PR to this task, wait for all checks, inspect the final PR diff, and obtain review approval.
- [ ] Immediately before merge, repeat the open-PR/unmerged-branch/dirty-worktree inventory required by project policy.
- [ ] Merge only if checks/review are green and no overlapping work appeared. Confirm the merge commit is contained in remote `main`.

## Task 8: Verify deployment and repeat the checkout with a new test order

**External systems, read-only except for the one approved synthetic test checkout:**
- Vercel deployment metadata/logs
- Stripe test Checkout/PaymentIntent/webhook event
- Firestore order/event/email-job records
- Fulfillment-provider draft lookup
- Transactional email provider test-message status

- [ ] Wait for the Vercel production deployment whose Git SHA equals the merged `main` commit and verify it is `READY`.
- [ ] Reconfirm without printing values:
  - Stripe key is test mode;
  - `ORDER_CONFIRM_PRINTFUL=false`;
  - `STRIPE_TAX_ENABLED=false` for deterministic comparison;
  - required Stripe webhook, Firestore, fulfillment, and email variables are present.
- [ ] Abort if any gate is unknown, Stripe is live, the deployment SHA differs, or manufacturing could be confirmed.
- [ ] Create exactly one new checkout using a real active Firestore-backed catalog variant plus synthetic customer/address data. Complete hosted Stripe Checkout with a Stripe test card.
- [ ] Do not retry or mutate the historical `manual_review` order.
- [ ] With bounded polling, prove separately:
  - Stripe Checkout is complete/paid and the signed webhook processed once;
  - the new Firestore order has checkout-validation evidence and is not in `manual_review`;
  - the full address, including line 2 when supplied, is persisted and reaches the unconfirmed fulfillment draft;
  - no duplicate fulfillment order exists;
  - one durable confirmation-email job is created and provider acceptance/delivery state is reported accurately;
  - Vercel logs contain no duplicate side effects or leaked PII/secrets.
- [ ] Do not create a refund in this run unless a separate approved refund test explicitly requires it.
- [ ] Record only sanitized IDs/statuses and remove all temporary scripts/env pulls after the run.

## Task 9: Close with evidence and remaining operational work

- [ ] Report a compact evidence matrix separating local tests, CI/PR, deployment, Stripe/webhook, Firestore, fulfillment draft, and email-provider outcomes.
- [ ] State explicitly whether the bug is fixed in source, merged, deployed, and proven with a new order; do not collapse these into one claim.
- [ ] Preserve the historical order in `manual_review` and list its disposition as a separate operational decision, not part of this patch.
- [ ] Confirm the original dirty checkout and its unrelated untracked files remain unchanged.

## Acceptance criteria

- Current-only Stripe Checkout shipping details validate successfully.
- Legacy-only Stripe Checkout shipping details continue to validate successfully.
- A present but invalid/currently changed nested address cannot be bypassed by legacy data.
- All mandatory tests, lint, TypeScript, and build checks pass.
- The PR is reviewed and merged through `main`; no direct push to `main` occurs.
- Vercel serves the exact merge SHA.
- One new safe Stripe test order completes without `ShippingAddressMissing`, duplicate fulfillment, confirmed manufacturing, or a duplicate email.
- The historical blocked order is not automatically retried or reopened.
