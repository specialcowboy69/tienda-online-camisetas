# No Context Club Storefront

Custom storefront with Next.js, Firebase Firestore, Stripe Checkout and Printful API.

The customer-facing storefront is English-first for now. Internal project
documentation may remain in Spanish to keep operations clear for the project
owner.

## Setup

1. Install Node.js 22.12.0 or newer (`engines.node: >=22.12.0`).
2. Install dependencies:

```bash
npm install
```

3. Copy `.env.example` to `.env.local` and fill every required value.
4. In Printful, create a Manual order / API store and generate a private token.
5. In Firebase, create a project, enable Firestore and create a service account key.
6. In Stripe, configure Checkout and add the webhook URL:

```text
https://your-domain.com/api/webhooks/stripe
```

Listen to:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
refund.created
refund.updated
refund.failed
```

7. Start locally:

```bash
npm run dev
```

Deployment builds and server runtimes must also support Node.js 22.12.0 or newer.
Verify the selected Vercel runtime in a preview deployment before production;
the local build does not confirm the deployed runtime. The lockfile currently
resolves Firebase Admin 14.5.0. See [Security notes](docs/SECURITY.md) for the
verified dependency audit and remaining findings.

## Operational Flow

- `/api/catalog/sync` syncs Printful products into Firestore. It requires `x-admin-secret` or `Authorization: Bearer CRON_SECRET`.
- `/api/shipping/rates` quotes live Printful shipping rates for a recipient and cart.
- `/api/checkout` creates the internal Firestore order and Stripe Checkout Session.
- `/api/webhooks/stripe` verifies Stripe signatures, validates the persisted paid checkout and reconciles refunds before new fulfillment under an owned order lease.
- `/api/webhooks/printful` receives fulfillment updates and tracking.
- `/admin` provides a small private operations panel using `ADMIN_SECRET`.

## Operations

See [`docs/operations.md`](docs/operations.md) for the deployment runbook, webhook checks, Printful retry handling, Resend sender setup, and the pre-production checklist.

Catalog products marked as ignored remain in Firestore for traceability, but are hidden from the public storefront. The storefront keeps display fields in the UI cart, then sends a clean cart input payload to shipping and checkout APIs.

Customer shipping is priced by the app after receiving Printful rates: Standard shipping is included for US, ES, FR, DE, IT, and PT, while CA and GB retain the quoted standard rate. Printful Fast is included only for US recipients. The shipping charge is not a prepaid customs duty. Manual storefront images can override Printful images through catalog fields.

## Printful Safety

Keep this in staging until you have tested the complete flow:

```text
ORDER_CONFIRM_PRINTFUL=false
```

This creates Printful draft orders. Set it to `true` only when you are ready for Printful to submit orders for fulfillment and charge your Printful billing method.

## Storefront Currency

The customer-facing currency is managed in Printful/storefront settings. After changing it there, sync the catalog or wait for the Printful webhook, then verify that active Firestore variants use the expected currency.

Do not add an app-level currency override unless the provider flow stops working.

## Storefront Language

The public storefront, checkout support pages, transactional emails and
Printful shipping locale are English-first:

- HTML document language: `en`.
- Printful shipping locale: `en_US`.
- Customer money formatting in emails: `en-US`.

Keep customer-facing copy aligned with `No Context Club`. The domain or search
descriptor `Funny Tees 4 All` should not replace the brand in visible UI.

## Taxes

`STRIPE_TAX_ENABLED=false` by default. Enable it only after Stripe Tax is configured correctly and your fiscal obligations are clear.

## Transactional Emails

The app sends transactional emails through Resend when these variables are configured:

```text
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=No Context Club <orders@your-domain.com>
```

Configure and verify the sending domain in Resend before using a production
sender address. Fulfillment and shipment receipts atomically create durable
email jobs. Missing configuration leaves jobs blocked without starting the
dispatch clock; it does not undo fulfillment. Admin can retry existing emails
independently. An accepted Resend ID proves API acceptance, not inbox delivery.
The message, sender and idempotency key stay frozen; unknown acceptance after
23 hours from first dispatch requires manual review. There is no new automatic
email retry scheduler or historical email backfill.

## Order Safety and Refund Operations

Admin shows server-checked checkout validation, fulfillment eligibility, refund
money and email acceptance separately. Revalidate checkout refreshes the paid
session evidence and canonical refund state under one lease; it never submits
fabrication, sends email, creates refunds or clears observed refund holds.
Before a Printful retry, the app looks up the same persisted external ID. HTTP
503 with Retry-After means ownership/recovery is retryable; blocked eligibility
requires review. A remote timeout can leave an accepted provider order, so do
not replace its identity or claim exactly-once external calls.

Refunds are manual in Stripe Dashboard. Manufacturing cancellation is a separate
Printful operation. Observed refunds before a fulfillment receipt latch a hold,
including pending, failed or canceled attempts; payment revalidation never
automatically unblocks that hold. See [the operating runbook](docs/operations.md)
for reconciliation and manual-review boundaries.

Launch remains **NO-GO**. Local tests and a synthetic browser fixture do not
establish deployed provider behavior, sandbox purchases, live refunds or email
delivery. Deployment requires explicit review, draining older unfenced workers,
confirming all eight Stripe subscriptions in test first, and no bulk migration.
See [deployment safety](docs/DEPLOYMENT.md) and [launch gates](docs/LAUNCH_CHECKLIST.md).

## Tests

```bash
npm test
```

Tests cover catalog/cart/pricing, complete delivery address validation, immutable
paid-checkout proof, authenticated recovery, event/order/email lease contention
and expiry, lookup-before-create and ambiguous Printful responses, canonical
refund pagination/holds, durable email identity/cutoff and combined payment ->
fulfillment -> email recovery regressions. Provider HTTP and persistence doubles
are synthetic; these tests do not contact live services or prove delivery.

## Project Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Development workflow](docs/DEVELOPMENT.md)
- [Security notes](docs/SECURITY.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md)
- [Launch checklist](docs/LAUNCH_CHECKLIST.md)
- [Brand and storefront guide](docs/BRAND_STOREFRONT.md)
- [Supplier profiles and product claims](docs/SUPPLIER_PROFILES.md)
- [Product content drafts](docs/product-content/README.md)
- [Product assets and size guides](docs/product-assets/README.md)

For AI agents and Codex sessions, read [AGENTS.md](AGENTS.md) before changing the project.
