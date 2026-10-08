import Stripe from "stripe";
import { getBaseUrl, isStripeTaxEnabled, requiredEnv } from "./env";
import { StoreOrder } from "./types";

let stripeClient: Stripe | undefined;

export async function readStripeWithinDeadline<T>(read: (options: Stripe.RequestOptions) => PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Stripe read exceeded its deadline.");
      error.name = "StripeReadDeadlineExceeded";
      reject(error);
    }, 20000);
  });
  try {
    // Bounds this caller, not the SDK transport. No late read resumes this caller.
    return await Promise.race([read({ timeout: 20000, maxNetworkRetries: 0 }), deadline]);
  } finally { clearTimeout(timer); }
}

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  }

  return stripeClient;
}

export function buildCheckoutReturnUrls(baseUrl: string): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: `${baseUrl}/success`,
    cancelUrl: `${baseUrl}/cancel`
  };
}

export function checkoutAllowedCountries(countryCode: string): Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[] {
  return [countryCode.toUpperCase() as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry];
}

export async function createStripeCheckoutSession(order: StoreOrder): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const baseUrl = getBaseUrl();
  const { successUrl, cancelUrl } = buildCheckoutReturnUrls(baseUrl);

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: order.id,
    customer_email: order.recipient.email,
    phone_number_collection: { enabled: true },
    billing_address_collection: "required",
    shipping_address_collection: {
      allowed_countries: checkoutAllowedCountries(order.recipient.countryCode)
    },
    automatic_tax: {
      enabled: isStripeTaxEnabled()
    },
    metadata: {
      order_id: order.id
    },
    payment_intent_data: {
      metadata: { order_id: order.id }
    },
    line_items: [
      ...order.items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: item.currency,
          unit_amount: item.unitAmount,
          product_data: {
            name: `${item.productName} - ${item.variantName}`,
            images: item.image ? [item.image] : undefined,
            metadata: {
              product_id: item.productId,
              sync_variant_id: String(item.syncVariantId)
            }
          }
        }
      })),
      {
        quantity: 1,
        price_data: {
          currency: order.totals.currency,
          unit_amount: order.totals.shipping,
          product_data: {
            name: `Shipping - ${order.shippingRate.name}`
          }
        }
      }
    ],
    success_url: successUrl,
    cancel_url: cancelUrl
  });
}
