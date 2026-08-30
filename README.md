# Tienda Online Camisetas

Custom storefront with Next.js, Firebase Firestore, Stripe Checkout and Printful API.

## Setup

1. Install Node.js 20+.
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
refund.updated
```

7. Start locally:

```bash
npm run dev
```

## Operational Flow

- `/api/catalog/sync` syncs Printful products into Firestore. It requires `x-admin-secret` or `Authorization: Bearer CRON_SECRET`.
- `/api/shipping/rates` quotes live Printful shipping rates for a recipient and cart.
- `/api/checkout` creates the internal Firestore order and Stripe Checkout Session.
- `/api/webhooks/stripe` verifies Stripe signatures and creates the Printful order after payment.
- `/api/webhooks/printful` receives fulfillment updates and tracking.
- `/admin` provides a small private operations panel using `ADMIN_SECRET`.

## Printful Safety

Keep this in staging until you have tested the complete flow:

```text
ORDER_CONFIRM_PRINTFUL=false
```

This creates Printful draft orders. Set it to `true` only when you are ready for Printful to submit orders for fulfillment and charge your Printful billing method.

## Taxes

`STRIPE_TAX_ENABLED=false` by default. Enable it only after Stripe Tax is configured correctly and your fiscal obligations are clear.

## Transactional Emails

The app sends transactional emails through Resend when these variables are configured:

```text
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=Tienda Online Camisetas <orders@your-domain.com>
```

Configure and verify the sending domain in Resend before using a production sender address. If either variable is missing, email sending is skipped and the order flow continues.

## Tests

```bash
npm test
```

The current tests cover money conversion, cart-to-order mapping, availability rejection, totals and address mismatch detection.
