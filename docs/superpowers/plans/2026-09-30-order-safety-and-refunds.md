# Order Safety and Refunds Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the five audited purchase defects while keeping refunds and fabrication cancellation manual.

**Architecture:** Add versioned checkout validation evidence, owned Firestore event/order leases, immutable durable email jobs, and a separate authoritative refund summary. Keep existing routes and providers; extract focused policy/reconciliation modules from order-service only where these boundaries require them.

**Tech Stack:** Next.js 15.5.26, TypeScript, Firebase Admin 14.5.0, Stripe SDK 17.x, Vitest, existing Resend HTTP transport, Node >=22.12.0.

**Spec:** `docs/superpowers/specs/2026-09-30-order-safety-and-refunds-design.md`.

## Global Constraints

- Baseline audited: main `4061d4e`; fetch/recheck current main before execution.
- Use a new `codex/order-safety-and-refunds` branch in an isolated worktree; preserve all unrelated local files, especially the primary checkout's untracked checklist and older plans.
- No production configuration changes, real orders, emails, refunds, fabrication cancellation, migration, deployment or automatic merge.
- Use TDD and provider mocks; never load production credentials into tests.
- Customer-visible strings are English. No dependency upgrades or catalog model changes.
- No `.superpowers/` process artifacts in commits. All new test files must enter the explicit `package.json` test list.
- Keep refund and fabrication operations separate. Never claim exactly-once remote side effects or email delivery from API acceptance.

## Review Focus

- Legacy records without new proof/job/lease fields must fail safely without historical mass email or accidental fabrication (Tasks 1, 2, 4).
- A crashed or expired worker must not overwrite a newer owner; a busy event must remain retryable (Tasks 2, 3).
- Accepted remote request with a lost response requires reconciliation, not a new ID or unbounded retry (Tasks 3, 4).
- Delayed/out-of-order Stripe events and more than 100 refunds must not corrupt financial totals (Task 5).
- Changed address, failed payment or pending refund must stay blocked even through an authenticated admin retry (Tasks 1, 5).

## Task map and sequencing

Execute the six tasks sequentially because they share order-service, Firestore and types. Use a fresh implementer and independent reviewer per task; parallel reviewers may inspect separate concerns, but never dispatch competing writers to these files.

1. Complete address and validated-payment retry gate.
2. Owned event and per-order leases.
3. Integrate fulfillment recovery with leases.
4. Durable confirmation/shipment email recovery.
5. Manual Stripe refund reconciliation and submission veto.
6. Combined scenarios, admin visibility, operating documentation and full verification.

Do not consider the branch ready for integration before Task 6. Each intermediate commit is a review checkpoint, not authorization to deploy a partial solution.

## Shared data contracts

Define incrementally in `src/lib/types.ts`; all fields added to StoreOrder are optional for compatibility.

```ts
type CheckoutValidationEvidence = {
  version: 1; validatedAt: string;
  source: "stripe_webhook" | "admin_revalidation";
  stripeSessionId: string; stripePaymentIntentId: string;
  paidAmount: number; currency: string; taxAmount: number;
  stripeTaxEnabled: boolean; orderSnapshotHash: string;
};
type ProcessingLease = { token: string; expiresAtMs: number };
type ClaimResult<T> =
  | { kind: "claimed"; lease: ProcessingLease; value: T }
  | { kind: "busy"; retryAfterSeconds: number };
type RefundSummary = {
  paymentIntentId: string; paidAmount: number; currency: string;
  refundedAmount: number; status: "none" | "partial" | "full";
  pendingCount: number; failedCount: number; canceledCount: number;
  fulfillmentBlocked: boolean; reconciledAt: string;
};
```

StoreOrder additions: `checkoutValidation?`, `orderProcessingLease?`, `emailPolicyVersion?: 1`, `refundSummary?`. Do not store refund lifecycle in `status`.

All monetary values are integer minor units. `pendingCount` includes both `pending` and `requires_action`; expose the exact status in the per-refund records. `paidAmount` comes from the current PaymentIntent's `amount_received`, including any collected tax. A malformed/incomplete provider snapshot must never clear an existing hold.

Run each task's named suites with `npx.cmd vitest run --environment node --testTimeout 15000 <test paths>`. Expected red: the new behavioral assertion fails; expected green: every named suite passes, with provider methods mocked. Run the same command before and after implementation.

## Task 1: Complete delivery address and safe fulfillment eligibility

**Files:** modify `src/components/product-purchase-panel.tsx`, `src/lib/checkout-calculator.ts`, `src/lib/order-service.ts`, `src/lib/stripe.ts`, `src/lib/types.ts`, `src/app/api/admin/orders/route.ts`, `src/app/api/admin/orders/[orderId]/retry-printful/route.ts` and `src/components/admin-panel.tsx`. Create `src/lib/checkout-validation.ts` and `src/app/api/admin/orders/[orderId]/revalidate-checkout/route.ts`.

**Test paths:** `src/lib/checkout-calculator.test.ts`, `src/lib/checkout-validation.test.ts` (new), `src/lib/order-service.test.ts`, `src/lib/admin-order-routes.test.ts` (new), `src/components/product-purchase-panel.test.tsx` (new).

**Interfaces:**
- `evaluatePaidCheckout(order, session, {source, stripeTaxEnabled, validatedAt})` returns `{valid:true,evidence}` or `{valid:false,reason,message}`; reasons: SessionMismatch, PaymentNotCompleted, PaymentMismatch, ShippingAddressMissing, ShippingAddressChanged.
- `hasValidCheckoutValidation(order): boolean` binds proof to a SHA256 of explicit immutable order ID, recipient, item/price/quantity, shipping and totals fields. Exclude status, tracking, proof, leases and refunds.
- `getPrintfulSubmissionEligibility(order)` returns `{allowed:true}` or `{allowed:false,reason,message}`. Reasons: CheckoutValidationRequired, CheckoutSnapshotChanged, OrderStatusBlocked, RefundReviewRequired (last implemented by Task 5).
- `revalidatePaidCheckout(orderId): Promise<StoreOrder>` retrieves only the persisted Stripe session. No fulfillment or review approval.

- [ ] Add failing comparator tests in `checkout-calculator.test.ts`: missing address/required fields false; apartment/state additions, removals, changes false; normalized optional null/empty and case/whitespace true.
- [ ] Add `checkout-validation.test.ts`: exact stored session identity and consistent order references; paid complete payment session and identifiable PI required; tax-aware amount/currency match; snapshot mutations invalidate evidence. Table-test no proof, impaid, expired, canceled, refunded and manual_review denied; paid and temporary Printful failure with valid evidence allowed.
- [ ] Add service and authenticated-route tests: blocked retries make zero order writes/provider calls; payment identifiers persist despite address review; revalidation failure leaves order untouched, success preserves status/error and never fulfills; unauthenticated revalidation returns401 before Stripe access.
- [ ] Run targeted Vitest files and capture expected red assertions, not import/configuration errors.
- [ ] Add optional `Address 2` PDP input via `updateRecipient`, retaining shipping-rate invalidation. Compare all six address fields. Validator requires complete/paid session, correct ID/references, amount/currency and matching final address; do not silently adopt a changed address.
- [ ] Save evidence on valid paid webhook; save PI/amount correlation on address failures. Add `payment_intent_data.metadata.order_id` to new Checkout sessions. Admin retry checks policy before any write/fulfillment call; existing Printful ID remains idempotent, but does not bypass later email policy.
- [ ] Permit `paid`, or `failed` with error.type PrintfulApiError and status429 or >=500, only with valid evidence. Deny all manual_review. Revalidation retrieves Stripe read-only and preserves manual_review; it is not a hidden approval action. Return409 plus reason for blocked retry. UI derives disabled Retry/reason from server eligibility.
- [ ] Add a Node/Vitest component wiring regression in `src/components/product-purchase-panel.test.tsx`, following the existing component test style: optional Address 2 control is present and bound to `updateRecipient("address2", ...)`; recipient edits clear rates and selectedRateId. This is a wiring test, not DOM interaction proof. Task6 separately verifies the actual interaction in a local browser with intercepted shipping/checkout routes and synthetic responses. Do not add a DOM-test dependency.
- [ ] Add new suites to npm test, run targeted green, commit `fix: validate delivery addresses and fulfillment retries` after independent review.

## Task 2: Owned event and order-processing claims

**Files:** `src/lib/types.ts`, `src/lib/firestore.ts`, `src/lib/firestore.test.ts`, `src/lib/order-service.ts`, `src/app/api/webhooks/printful/route.ts`, webhook route tests; create `src/lib/processing-errors.ts`.

**Test paths:** `src/lib/firestore.test.ts`, `src/lib/order-service.test.ts`, `src/lib/printful-webhook-route.test.ts`, `src/lib/stripe-webhook-route.test.ts` (new). Modify `src/app/api/webhooks/stripe/route.ts` to map processing exceptions when required.

**Interfaces:**
- `beginWebhookEventProcessing(source,eventId,payload): Promise<ClaimResult<null> | {kind:"processed"}>`.
- `finishWebhookEventProcessing(source,eventId,token): Promise<boolean>` and `failWebhookEventProcessing(source,eventId,token,error): Promise<boolean>`; false means lost ownership.
- `claimOrderProcessing(orderId): Promise<ClaimResult<StoreOrder> | {kind:"missing"}>`; no status/fulfillment filter here because refunds must reconcile shipped orders too.
- `renewOrderProcessing(orderId,token): Promise<boolean>`, `updateClaimedOrder(orderId,token,update): Promise<boolean>`, `releaseOrderProcessing(orderId,token): Promise<boolean>`.
- `ProcessingBusyError(retryAfterSeconds)` and `ProcessingOwnershipLostError` mapped by touched routes to503 and Retry-After, never200.

- [ ] Write failing stateful transaction-fake tests with fake clock: processing denies second claim; expiry admits different token; stale finish/fail/renew/update/release cannot modify new owner; completed event no-op; two distinct events still compete for one order lease.
- [ ] Run targeted suites red. Generate token outside transaction callback, compute clock inside callback; no network calls inside callback.
- [ ] Implement 120000ms leases and transactional owner+expiry checks. Legacy processedAt-without-status remains completed; old processing uses updatedAt+TTL; malformed old records become retryable diagnostic failures rather than claimed success.
- [ ] Update both webhook call sites and mocks to consume discriminated results and pass tokens. Busy/lost ownership503; terminal duplicate200. Ensure old worker failure cannot downgrade newer processed state.
- [ ] Run targeted green and commit `fix: fence concurrent webhook and order processing` after independent review.

## Task 3: Safe leased fulfillment and ambiguous-response recovery

**Files:** `src/lib/order-service.ts`, `src/lib/printful.ts`, their tests, admin retry route, Firestore claimed-update helpers.

**Test paths:** `src/lib/order-service.test.ts`, `src/lib/printful.test.ts`, `src/lib/admin-order-routes.test.ts`, `src/lib/firestore.test.ts`.

**Interfaces:** keep public `submitOrderToPrintful(orderId): Promise<StoreOrder>`; internal `submitClaimedOrderToPrintful(order, token): Promise<StoreOrder>`. Consume Task1 validator and Task2 shared lease; never reacquire a lease recursively.

- [ ] Add failing deferred-promise tests: simultaneous Stripe sessions/admin call creates once; no write or call for denied state; lookup failure cannot become not-found; accepted request with lost response is recovered using original external ID; stale completion cannot regress newer state.
- [ ] Acquire shared order lease before financial/fulfillment mutations in paid Stripe handling and admin submission. Re-read latest order and validate eligibility under ownership. Guard expired/failed Stripe events against regressing fulfilled or terminal states.
- [ ] Persist stable external ID before remote creation, lookup it first. Existing remote order must match expected external identity. Only explicit404 permits creation; a lookup timeout/5xx does not. On ambiguous create timeout/5xx/conflict, reconcile by lookup and never mint a new ID. Mark retryable/uncertain state honestly.
- [ ] Bound provider requests to20000ms. Renew/check lease immediately before remote work; fence writes afterward. Catch asynchronous finish failures deliberately with await, but keep later email recovery separate from fulfillment failure classification.
- [ ] Run targeted green and commit `fix: reconcile fulfillment retries under order ownership` after independent review.

## Task 4: Durable emails independent of fulfillment

**Files:** create `src/lib/email-jobs.ts`, `src/lib/email-jobs.test.ts`, `src/app/api/admin/orders/[orderId]/retry-email/route.ts`; modify email renderer/transport/tests, Firestore helpers/tests, order-service/tests, Printful route/tests, admin listing/UI and types.

**Test paths:** `src/lib/email-jobs.test.ts`, `src/lib/email.test.ts`, `src/lib/firestore.test.ts`, `src/lib/order-service.test.ts`, `src/lib/printful-webhook.test.ts`, `src/lib/printful-webhook-route.test.ts`, `src/lib/admin-order-routes.test.ts`.

**Interfaces and records:**
- `EmailMessage = {from?:string;to:string;subject:string;text:string;html:string;tags:Array<{name:string;value:string}>}`; freeze sender before first network attempt.
- Email job document in `emailJobs`: deterministic hashed ID, orderId, kind (`order_confirmation` or `shipment`), immutable message, idempotencyKey, status (`pending`/`processing`/`blocked`/`accepted`/`manual_review`), attempts, firstDispatchAtMs?, providerEmailId?, lease?, sanitized lastError?, createdAt/updatedAt.
- `sendEmail(message, idempotencyKey): Promise<{kind:"accepted";providerEmailId:string} | {kind:"blocked";reason:"missing_configuration"}>`.
- `processEmailJob(jobId): Promise<"accepted"|"retry"|"blocked"|"manual_review"|"busy">`.
- `retryOrderEmails(orderId): Promise<Array<{jobId:string;result:Awaited<ReturnType<typeof processEmailJob>>}>>` only processes existing jobs, never fabricates/creates refunds.
- `completeClaimedFulfillment(orderId,token,update,job)` and `applyClaimedShipment(orderId,token,update,job)` atomically persist order result and create-if-absent immutable job; both use current order lease.

- [ ] Write failing tests: fulfillment succeeds/email fails then retry sends only email; successful response must include ID; accepted job never repeats; missing config blocked/no firstDispatch/no HTTP; acceptance with lost persistence retries identical payload/key; after23h ambiguous job manual_review/no send; two concurrent job workers one owner.
- [ ] Create confirmation job atomically with Printful result, shipment job with shipment update. New orders get emailPolicyVersion1. Old fulfilled orders without jobs are flagged for manual review, not auto-enqueued; preserve existing accepted jobs.
- [ ] Move render/transport behind job processing. Persist firstDispatchAt before call and freeze payload/sender. Resend request timeout20000ms; retry cutoff82800000ms from first dispatch. Do not rotate keys or mark missing config accepted. Store accepted provider ID; do not claim inbox delivery.
- [ ] Existing-ID paths process existing pending job. Retry/busy email results keep webhook retryable via503 without undoing fulfillment. Blocked jobs remain visibly blocked; after retry horizon use manual_review and surface operational status. Recovery via authenticated retry-email does not call fulfillment. No scheduler is added or claimed.
- [ ] Include stable shipment ID in Printful event identity and job identity (fallback stable tracking identity); two shipments in same second stay distinct. Missing both identifiers goes to review, not a reusable pending shipment key.
- [ ] Test both atomic-enqueue crash boundaries, legacy no-spam behavior, unauthorized retry-email401, separate shipment identities and replay. Extend admin review listing to include existing pending/blocked/manual-review email jobs, using bounded simple queries without silently requiring an undeployed composite index.
- [ ] Run targeted green, update test script, commit `fix: recover transactional emails without resubmitting orders` after independent review.

## Task 5: Authoritative manual-refund reconciliation

**Files:** create `src/lib/refund-service.ts`, `src/lib/refund-service.test.ts`; modify Stripe helper/tests, order-service/tests, Firestore helpers/tests, types and admin financial display.

**Test paths:** `src/lib/refund-service.test.ts`, `src/lib/stripe.test.ts` (new), `src/lib/order-service.test.ts`, `src/lib/firestore.test.ts`, `src/lib/checkout-validation.test.ts`.

**Interfaces:**
- `reconcileOrderRefunds(order:StoreOrder, token:string): Promise<RefundSummary>` consumes held Task2 order lease, reads Stripe, persists summary with fenced writes, never acquires a second lease.
- `handleStripeRefundEvent(event:Stripe.Event): Promise<"reconciled"|"unrelated">` resolves order, obtains same order lease, invokes reconciler. Own/unresolved or contradictory association throws recoverable error; proven unrelated returns unrelated.
- Persist per-refund snapshots under `orders/{orderId}/refunds/{refundId}`: amount, currency, status (pending/requires_action/succeeded/failed/canceled), paymentIntentId, reconciledAt. Summary totals are rebuilt, not incremented.

- [ ] Add failing fixtures for full/partial, two partials completing total, pending->succeeded, failed/canceled, more than100 refunds, duplicates/reordered events, foreign currency/reference contradiction, unmatched own-store event before paid event, expanded PI, and fulfillment events preserving financial summary.
- [ ] Listen to refund.created/refund.updated/refund.failed and charge.refunded. Normalize string/expanded PI IDs; resolve stored PI or retrieve PI/Charge metadata read-only. For legacy PaymentIntents without metadata, list Checkout Sessions filtered by payment_intent and verify the persisted session/order references. Validate actual stored order/session/PI references; never create missing orders from event metadata. Return recoverable failure for ambiguous association, not silent processed.
- [ ] Under shared order lease retrieve current PaymentIntent and every refund page (limit100, starting_after until has_more=false). Validate currency/identity/status and integer nonnegative amounts, deduplicate identical IDs, reject contradictory duplicates or totals above captured amount; sum only succeeded amounts against actual successful captured payment amount, including tax. Zero succeeded means none; positive below captured means partial; equal captured means full. Never derive finality from event timestamp or embedded first page; a later canonical failed/requires_action state may reduce the succeeded total while preserving the safety latch.
- [ ] Persist independent refundSummary and snapshots without overwriting fulfillment status. Any refund attempt observed before remote order creation sets fulfillmentBlocked=true; preserve that latch across later failed/canceled snapshots. Terminal legacy status refunded/canceled stays blocked.
- [ ] Immediately before fresh fulfillment creation, reconcile refunds and re-evaluate eligibility inside held lease. API failure/unknown financial state fails closed. Existing completed fulfillment may reconcile refunds without causing a new submission. Add regression for refund received after shipment and retry of refunded-but-not-submitted order.
- [ ] Never call stripe.refunds.create or production cancellation. Document remaining Dashboard-refund-vs-remote-create race and manual operating checks. Test zero financial/provider mutations throughout refund handling.
- [ ] Run targeted green, register suites, commit `fix: reconcile manual Stripe refunds independently of fulfillment` after independent review.

## Task 6: Combined verification and operating handoff

**Files:** tests from Tasks1-5, `docs/operations.md`, `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/LAUNCH_CHECKLIST.md`, `README.md`, `package.json`. These documents exist on origin/main; modify them only in the new worktree, not the unrelated untracked primary-checkout checklist.

- [ ] Add combined regression: paid complete address -> one fulfillment -> email failure -> webhook/admin email recovery; partial/pending refund blocks new fulfillment; different event IDs race for same order; expired old owner cannot overwrite refund latch or accepted email.
- [ ] Verify admin displays payment validation, eligibility reason, financial summary and email acceptance separately; no secret/PII in logs beyond necessary existing order records. Verify PDP address2 interaction with mocked network in mobile/desktop layout.
- [ ] Document manual refund workflow, separate fabrication cancellation, blocked/manual-review resolution boundaries, required additional Stripe event subscriptions, lease busy503, 23h email cutoff and legacy/no-spam migration. Do not change provider subscriptions while implementing.
- [ ] Document deployment safety: drain unfenced workers, no bulk backfill, deploy only after explicit review, confirm subscriptions in test first. Keep launch NO-GO; mark local proof separately from unperformed sandbox/live purchase/email delivery.
- [ ] Execute `npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run build`, `npm.cmd audit --omit=dev`. Preserve audit output and distinguish known accepted/unresolved advisories; no npm audit fix or --force.
- [ ] Independent whole-branch review checks interfaces across tasks and deferred findings. Fix/review consequential issues before calling implementation complete. Commit documentation separately, explicit paths only.
- [ ] Before PR/readiness, perform AGENTS integration inventory: fetch, all open PRs, unmerged branches, dirty worktrees/unpushed commits. Preserve unrelated files. Report exact branch/commits, test evidence and remaining operational requirements; do not merge/deploy without authorization.

## Plan review status

- [x] Scope maps to all five audited issues; no live provider mutations in execution.
- [x] Shared order lease supports both fulfillment and refunds, including shipped orders.
- [x] Task1 validation excludes mutable lease/refund/email state from snapshot hash.
- [x] Task4 result handling preserves fulfillment and exposes independent email recovery.
- [x] Task5 reconciliation uses Task2 lease and adds a veto to Task1 eligibility.
- [ ] Human review of this saved plan, required by writing-plans before implementation.
- [ ] Implementation, verification, independent code review and handoff.
