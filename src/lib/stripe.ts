import Stripe from "stripe";
import { getAllowedShippingCountries, getBaseUrl, isStripeTaxEnabled, requiredEnv } from "./env";
import { StoreOrder } from "./types";

let stripeClient: Stripe | undefined;

export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  }

  return stripeClient;
}

export async function createStripeCheckoutSession(order: StoreOrder): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const baseUrl = getBaseUrl();

  return stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: order.id,
    customer_email: order.recipient.email,
    phone_number_collection: { enabled: true },
    billing_address_collection: "required",
    shipping_address_collection: {
      allowed_countries: getAllowedShippingCountries() as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[]
    },
    automatic_tax: {
      enabled: isStripeTaxEnabled()
    },
    metadata: {
      order_id: order.id
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
    success_url: `${baseUrl}/success?order_id=${order.id}`,
    cancel_url: `${baseUrl}/cancel?order_id=${order.id}`
  });
}
