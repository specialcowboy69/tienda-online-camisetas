# Order safety and refunds — agreed scope and implementation design

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../LAUNCH_CHECKLIST.md).


Status: design prepared for review; implementation has not started.
Date: 2026-09-30. Source baseline: `origin/main` at `4061d4e`.

## Scope approved in the conversation

Correct five audited defects in small, independently reviewed changes:

1. Preserve and validate the complete delivery address.
2. Restrict administrative fulfillment retries to paid, validated orders.
3. Recover confirmation emails independently of fulfillment.
4. Prevent overlapping webhook/order processing with recoverable ownership.
5. Track manual Stripe refunds accurately without conflating them with shipment.

The implementation is local, on a new `codex/` branch based on current main.
No live orders, refunds, emails, production configuration changes, bulk migration,
automatic fabrication cancellation, automatic refund initiation, or deployment
are authorized by this implementation scope. Public/customer copy stays English.

## Design decisions for review

### Complete address and validated payment

Add the optional apartment/address2 field to the PDP. Compare street, second
line, city, state, country and postcode with Stripe's final shipping address.
Normalize whitespace/case and absent optional values; do not guess equivalence
between addresses or silently replace an address used for a shipping quote.
Missing or changed shipping address stops fulfillment for manual review.

Persist payment/session identifiers even when a paid order needs address review.
Store versioned validation evidence bound to the immutable order snapshot after
payment amount/currency/session and address checks succeed. A normal fulfillment
retry requires that evidence and an eligible operational state, not merely a
status called `failed`. A separate authenticated revalidation action may retrieve
the stored Stripe session and refresh evidence; it cannot approve a manual review,
change an address, clear its error or send an order to fabrication.

Legacy orders without proof remain blocked until revalidated. Every
`manual_review`, payment failure, canceled or refunded order is ineligible for
ordinary fulfillment retry. A temporary fulfillment failure after validated
payment remains retryable. The UI explains a blocked action; server checks remain
authoritative.

### Recoverable ownership, not an exactly-once promise

An event claim has a random owner token and a 120-second expiry. An active claim
returns busy/503, rather than a successful acknowledgement. Only its current,
unexpired owner can finish or fail it. Completed events remain deduplicated;
expired claims can recover after checking durable state.

Distinct events and admin actions must share a separate per-order processing
lease. Financial reconciliation can acquire this lease even for shipped orders;
fulfillment eligibility is checked separately against the latest order.
External calls never occur inside Firestore transaction callbacks.

Persist and reuse the stable Printful external ID. Recover a timed-out submission
by looking it up; a failed lookup is not proof that no order exists. Bound each
external request to 20 seconds, verify/renew ownership before side effects and
fence result writes. An expired owner cannot overwrite a newer worker. Leases
cannot undo an already running remote request, so provider idempotency and
reconciliation remain necessary. Drain old unfenced workers at deployment.

### Durable email state

Persist one immutable confirmation email job atomically with the successful
fulfillment result. Persist a shipment job atomically with shipment processing,
keyed by stable shipment identity. Provider acceptance and inbox delivery are
different: record `accepted` plus the provider email ID, not `delivered`.

Webhook retries and an authenticated per-order email retry recover existing jobs
without recreating fulfillment. A retryable/busy email outcome causes the webhook
to remain retryable; it is not silently acknowledged. An operator can recover
blocked settings after correcting them. No cron/scheduler is added in this scope.

Use the same sender, payload and idempotency key across attempts. Resend retains
keys for 24 hours; stop automatic retries 23 hours after the first dispatch and
move an ambiguous unsent/accepted-unknown job to manual review. Never reset the
clock or key. Missing email configuration is blocked, not accepted, and does not
start this clock. Accepted jobs never resend automatically. Legacy fulfilled
orders without a job must not trigger historical emails automatically.

### Stripe remains the refund tool

The operator initiates total/partial refunds from Stripe Dashboard. The store
only reads and reconciles Stripe's authoritative financial state. It does not
issue refunds or cancel fabrication.

Store refund state separately from `OrderStatus`: successful refunded amount,
total/partial classification, pending/failed/canceled counts, per-refund IDs and
statuses. Retrieve all refund pages; do not rely on the charge's embedded first
page or add webhook amounts blindly. Duplicate/old events trigger reconciliation
against current Stripe data, not a rollback to an old payload.

Use PaymentIntent metadata and stored identifiers to associate events. Persist
unmatched own-store events as recoverable errors; explicitly ignore events proven
unrelated to the shop. Never create a phantom order using unverified metadata.

Before any new fulfillment creation, read/refetch refund state under the same
order lease. Any observed refund attempt before fulfillment sets a safety latch;
it cannot silently resume fabrication after pending becomes failed/canceled.
Manual resolution of that latch is outside this change. There remains a narrow
cross-provider race if an operator starts a Dashboard refund after the last read:
the operating procedure must check/cancel fabrication separately.

## Explicit non-goals

- Redesign home, catalog, PDP layout, success/cancel pages, or the general cart.
- Change prices, shipping rules, tax policy, Stripe API version or dependencies.
- Build a customer refund portal or an automatic financial decision engine.
- Clear legal, fiscal or launch blockers based only on mocked tests.

## Acceptance

Each defect gets regression tests demonstrated red before implementation, then
green with simulated providers. Add new suites to the explicit npm test list.
Run full tests, lint, TypeScript, build and production dependency audit. Review
each task and the combined branch. Report local/mocked evidence separately from
future sandbox/live verification. Preserve the user's unrelated local files.

## Provider references

- Stripe refunds: https://docs.stripe.com/refunds
- Refund statuses: https://docs.stripe.com/api/refunds/object
- Refund pagination: https://docs.stripe.com/api/refunds/list
- Metadata copying: https://docs.stripe.com/metadata
- Webhook ordering: https://docs.stripe.com/webhooks#event-ordering
- Resend idempotency: https://resend.com/docs/dashboard/emails/idempotency-keys
- Printful external IDs: https://developers.printful.com/docs/
