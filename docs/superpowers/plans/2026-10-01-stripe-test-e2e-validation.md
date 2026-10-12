# Stripe Test End-to-End Validation Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate one complete storefront order in Stripe test mode through checkout, signed webhook processing, Firestore, a non-confirmed fulfillment draft, durable email handling, and partial-then-full refund reconciliation without charging real money or starting fabrication.

**Architecture:** Exercise the currently promoted Vercel deployment through its public storefront and provider test APIs. Use the public catalog and shipping endpoints to select real Firestore-backed product data, complete hosted Stripe Checkout with a test card, and inspect sanitized state in Stripe, Firestore, the fulfillment provider, Resend, and Vercel. Refunds are created only in Stripe test mode; the application receives their webhooks and reconciles canonical refund state. No application source code is changed by this run.

**Tech Stack:** Next.js on Vercel, Firestore, Stripe Checkout test mode, fulfillment provider API with `confirm=false`, Resend, PowerShell, Vercel CLI, browser automation.

**Spec:** User-approved sandbox validation plus `docs/DEPLOYMENT.md` and `docs/operations.md` at the exact production commit.

## Global Constraints

- Do not edit application code, dependency files, provider configuration, Firestore documents, or existing orders manually.
- Do not push or merge anything. This operational plan remains an untracked process artifact under `docs/superpowers/` as required by `AGENTS.md`.
- Use the deployment currently promoted to production only after proving that its Git SHA equals `origin/main`.
- Do not treat the stale local checkout as production truth. Read source expectations from the verified production SHA.
- Prove the environment bound to the promoted deployment without printing secrets: Stripe key must be test mode, `ORDER_CONFIRM_PRINTFUL` and `STRIPE_TAX_ENABLED` must equal `false`, and required webhook, Firestore, fulfillment, and Resend values must be present. Current project-level variables alone are not sufficient evidence for an older deployment.
- The test payment may create a real Firestore order, a Stripe test PaymentIntent, a fulfillment-provider **draft**, an email job, and a Resend test message. It must not create a real card charge or confirm manufacturing.
- Use only synthetic order data and `delivered@resend.dev`; do not use a customer's or operator's personal address or mailbox.
- Never print environment values, tokens, raw provider payloads, full postal addresses, email bodies, or Firestore customer records.
- Do not retry the historical paid test order and do not press any admin fulfillment retry control.
- Abort immediately if Stripe is live, `ORDER_CONFIRM_PRINTFUL` is true or unknown, the promoted SHA differs from `origin/main`, the webhook endpoint is not the expected test endpoint, totals/currency are unexpected, or the fulfillment draft cannot be distinguished from a confirmed order.
- A Stripe refund does not cancel fulfillment. Verify the remote order remains a draft before and after refunding; do not confirm, cancel, or delete it during this run.

## Review Focus

- Confirm that the accepted side effects are limited to one new test checkout/order, one non-confirmed fulfillment draft, one transactional test email, and two Stripe test refunds on the same PaymentIntent.
- Confirm that partial and full refund transitions are checked from provider state and Firestore, not inferred from webhook HTTP responses alone.
- Confirm that email evidence distinguishes job creation, provider acceptance, and simulated delivery.
- Confirm that the run stops on any mismatch rather than retrying an uncertain external operation.

---

## Task 1: Pin the exact production release and establish a clean evidence record

**Files:**
- Read: `AGENTS.md`
- Read at production SHA: `docs/operations.md`
- Read at production SHA: `docs/DEPLOYMENT.md`
- Read at production SHA: `src/lib/order-service.ts`
- Read at production SHA: `src/lib/refund-service.ts`
- Read at production SHA: `src/lib/email-jobs.ts`

- [x] Fetch remote refs without changing the current branch:

```powershell
git fetch origin --prune
git rev-parse origin/main
git status --short --branch
```

- [x] Query Vercel/GitHub deployment metadata read-only and record only deployment ID, state, target, created time, and Git SHA.
- [x] Assert that the promoted production deployment is `READY`/successful and its Git SHA equals `origin/main`.
- [x] Inspect expected behavior with `git show origin/main:<path>` rather than reading the stale working-tree copy.
- [x] Record a UTC start timestamp and a redacted evidence table containing only test IDs/statuses created by this run.

**Stop condition:** Any SHA mismatch, an in-progress deployment, an unexpected production target, or unrelated open release work that could change the deployment during the test.

## Task 2: Verify the effective sandbox gates without exposing secrets

**Files:**
- Temporary only: a directory created with `New-Item` under the operating-system temp directory
- Temporary only: Vercel link metadata and pulled environment file inside that directory

- [x] Confirm the Vercel CLI identity and discover the exact team/project read-only:

```powershell
vercel whoami
vercel teams ls
vercel project ls --scope <verified-scope>
```

- [x] Inspect the selected deployment's own environment/configuration snapshot through Vercel CLI/API. If Vercel exposes only current project variables and not the values bound to that deployment, stop rather than treating an `env pull` as deployment-specific proof.
- [ ] If deployment-specific inspection is available, use an isolated temporary directory and parse the result locally. Print only these booleans/prefix checks:
  - `STRIPE_SECRET_KEY` starts with `sk_test_`.
  - `STRIPE_WEBHOOK_SECRET` is present.
  - `ORDER_CONFIRM_PRINTFUL` is exactly `false`.
  - `STRIPE_TAX_ENABLED` is exactly `false` for this deterministic total test.
  - Firebase Admin, fulfillment-provider, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL` variables are present.
  - `NEXT_PUBLIC_BASE_URL` resolves to the intended public domain.
- [x] Using the test Stripe key without printing it, list webhook endpoints and assert exactly one relevant enabled endpoint points to `/api/webhooks/stripe` on the intended domain with these events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `charge.refunded`
  - `refund.created`
  - `refund.updated`
  - `refund.failed`
- [x] Record that Stripe's endpoint-list API does not reveal an existing signing secret, so a preflight secret comparison cannot be automated from that list. Treat successful signature verification of the first real test webhook as the dynamic proof; if it fails, stop after that single test payment and do not retry checkout.
- [ ] Verify the Resend sender is configured and query only domain/sender verification status. Do not send a standalone email.
- [x] Remove the temporary env file and link directory after all provider calls finish, even if the run aborts.

**Stop condition:** No deployment-specific environment proof, any live Stripe prefix, missing signing secret, missing required integration, unverified sender, unexpected webhook URL/events, `STRIPE_TAX_ENABLED` other than explicit `false`, or `ORDER_CONFIRM_PRINTFUL` other than explicit `false`.

## Task 3: Select a real sellable variant and obtain a server-quoted shipping rate

**Interfaces:**
- `GET https://www.funnyteesforall.com/api/catalog`
- `POST https://www.funnyteesforall.com/api/shipping/rates`

- [x] Fetch the public catalog and select one active, non-ignored product and one available `syncVariantId`. Record product ID, slug, selected variant ID, currency, and displayed unit price only.
- [x] Use synthetic recipient data:
  - Name: `NCC Test Order`
  - Email: `delivered@resend.dev`
  - Country: an allowed country with a syntactically valid non-personal test address
  - Quantity: `1`
- [x] Request shipping rates with the exact selected item and recipient.
- [x] Select the standard rate returned by the server, recording only rate ID, currency, and customer-facing amount.
- [x] Recalculate the expected checkout total from the catalog price and returned customer shipping amount.

**Stop condition:** No active real variant, provider rate failure, unexpected currency, catalog/quote mismatch, or any need to invent identifiers.

## Task 4: Create and complete one hosted Stripe test checkout

**Interfaces:**
- `POST https://www.funnyteesforall.com/api/checkout`
- Stripe-hosted Checkout page returned by the API

- [x] Submit the exact recipient, one real item, and selected `shippingRateId` to `/api/checkout` once.
- [x] Record the returned internal `orderId` and Stripe Checkout URL without exposing customer fields.
- [x] Open the returned Stripe-hosted page and verify it is visibly in test mode, has the expected merchant, currency, line items, and total.
- [x] Complete payment with Stripe test card `4242 4242 4242 4242`, a future expiry, and any valid test CVC.
- [x] Enter the same material shipping address used for the quote so address comparison cannot trigger manual review.
- [x] Wait for the success redirect, but do not treat the page alone as completion evidence.

**Stop condition:** The page is not test mode, total/currency/items differ, Stripe requests a real payment method, the address cannot be kept consistent, or the first submission has an uncertain outcome. Never create a second checkout to work around uncertainty.

## Task 5: Prove webhook, Firestore, fulfillment draft, and email outcomes

**Data inspected read-only after the checkout write:**
- `orders/<orderId>`
- `webhookEvents/stripe:<eventId>`
- `emailJobs/<jobId>` associated with the order
- Stripe Checkout Session and PaymentIntent in test mode
- Fulfillment-provider order referenced by `printfulOrderId`
- Resend message referenced by the email job's provider ID
- Vercel runtime logs filtered to this test window/order

- [x] Poll with bounded retries until the signed Stripe event is `processed` or a terminal failure is visible.
- [x] Assert the Stripe Checkout Session is complete/paid, the PaymentIntent is test-mode succeeded, and amount/currency equal the server quote.
- [ ] Assert the Firestore order has the same Session/PaymentIntent association, validated totals, and no `manual_review` or error state.
- [ ] Assert a single remote fulfillment order exists for the stable external ID and its current status is `draft`/unconfirmed. Combine this with the verified `confirm=false` request path; report honestly that a current-state query does not by itself prove the absence of every historical transition.
- [ ] Assert one durable order-confirmation email job exists and reaches provider `accepted` with a provider ID.
- [ ] Query Resend for that provider ID and distinguish `accepted`, `sent`, simulated `delivered`, bounced, or failed. Do not call acceptance “inbox delivery.”
- [x] Review redacted Vercel logs for one checkout webhook processing path and absence of secret/PII leakage or duplicate fulfillment creation.

**Stop condition:** Missing association, duplicate remote orders, provider status other than draft, manual review, failed webhook, missing/failed email job, or disagreement among Stripe, Firestore, and the fulfillment provider.

## Task 6: Validate partial and full refund reconciliation on the same test payment

**Interfaces:**
- Stripe test Refund API or Stripe Dashboard in test mode
- Existing `/api/webhooks/stripe` endpoint

- [ ] Read the PaymentIntent's `amount_received` and current refunds directly from Stripe test mode.
- [ ] Create one small partial refund in test mode, using an idempotency key derived from the test order ID. Do not refund the full amount in the first call.
- [ ] Wait for refund webhooks and assert:
  - Stripe reports the partial refund `succeeded`.
  - Firestore stores the refund snapshot under `orders/<orderId>/refunds`.
  - Canonical `refundSummary.status` is `partial`.
  - `refundedAmount` equals only the succeeded partial amount.
  - `refundCount` is greater than zero and fulfillment retry eligibility is false.
  - Because this flow already has a persisted remote draft ID before the refund, record the actual `fulfillmentBlocked` value rather than expecting it to become true solely from this later refund.
  - The operational order/fulfillment identity is preserved rather than overwritten with a generic refunded state.
- [ ] Create a second test refund for the exact remaining captured amount, with a distinct idempotency key.
- [ ] Wait for refund webhooks and assert:
  - Stripe's sum of succeeded refunds equals `amount_received` exactly.
  - Firestore contains both refund snapshots.
  - Canonical `refundSummary.status` is `full`.
  - Pending/failed/canceled amounts are not counted as succeeded.
  - `refundCount` and eligibility continue to block another fulfillment attempt; do not require `fulfillmentBlocked=true` when the provider draft ID predates the refund.
- [ ] Re-query the remote fulfillment order and prove it remains an unconfirmed draft. Do not cancel or delete it.
- [ ] Confirm no second confirmation email was accepted because refund events do not recreate the order-confirmation job.

**Stop condition:** Any refund call is live mode, the amount would exceed the captured test amount, Stripe/Firestore totals disagree, refund processing loses ownership, or the fulfillment draft changes state.

## Task 7: Close the run and report production-readiness evidence

- [ ] Re-query Stripe, Firestore, fulfillment provider, Resend, and Vercel once after the final webhook settles.
- [ ] Produce a concise evidence matrix with separate columns for:
  - Local/source expectation
  - Provider/API acceptance
  - Firestore persisted state
  - Vercel deployment/runtime evidence
  - End-user delivery evidence
- [ ] Mark each stage as `PASS`, `FAIL`, or `NOT PROVEN`; never infer delivery/fabrication from an HTTP 200.
- [ ] State explicitly that no real money was charged and no manufacturing was confirmed.
- [ ] List the exact remaining steps for the later controlled live purchase with `ORDER_CONFIRM_PRINTFUL=true`, but do not change that variable or start a live purchase.
- [ ] Run `git status --short --branch` and confirm no application files, secrets, `.vercel` directory, or temporary artifacts were added to the repository.

## Verification Commands if a Code Defect Is Found

No code change is authorized by this plan. If validation exposes a defect, stop, document the failing stage and sanitized evidence, and request a separate fix task on a fresh `codex/` branch. That later code task must run:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

For dependency or security changes, it must also run:

```powershell
npm.cmd audit --omit=dev
```
