"use client";

import { ShoppingCart, Truck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { CatalogProduct, CartItemInput, Recipient, ShippingRate } from "@/lib/types";

type StorefrontProps = {
  products: CatalogProduct[];
  allowedCountries: string[];
  defaultCountry: string;
};

type CartLine = CartItemInput & {
  label: string;
  price: string;
  currency: string;
};

export function Storefront({ products, allowedCountries, defaultCountry }: StorefrontProps) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [recipient, setRecipient] = useState<Recipient>({
    name: "",
    email: "",
    phone: "",
    address1: "",
    address2: "",
    city: "",
    stateCode: "",
    countryCode: defaultCountry,
    zip: ""
  });
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [selectedRateId, setSelectedRateId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  }, [cart]);

  function addVariant(product: CatalogProduct, syncVariantId: number) {
    const variant = product.variants.find((candidate) => candidate.syncVariantId === syncVariantId);
    if (!variant) {
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id && item.syncVariantId === syncVariantId);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id && item.syncVariantId === syncVariantId ? { ...item, quantity: item.quantity + 1 } : item
        );
      }

      return [
        ...current,
        {
          productId: product.id,
          syncVariantId,
          quantity: 1,
          label: `${product.name} - ${variant.name}`,
          price: variant.retailPrice,
          currency: variant.currency
        }
      ];
    });
    setRates([]);
    setSelectedRateId("");
  }

  function updateRecipient(field: keyof Recipient, value: string) {
    setRecipient((current) => ({ ...current, [field]: value }));
    setRates([]);
    setSelectedRateId("");
  }

  async function fetchRates(event: FormEvent) {
    event.preventDefault();
    setError("");
    setStatus("");
    setLoading(true);

    try {
      const response = await fetch("/api/shipping/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, items: cart })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Shipping rates failed.");
      }

      setRates(data.rates || []);
      setSelectedRateId(data.rates?.[0]?.id || "");
      setStatus(data.rates?.length ? "Shipping options ready." : "No shipping options found.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Shipping rates failed.");
    } finally {
      setLoading(false);
    }
  }

  async function checkout() {
    setError("");
    setStatus("");
    setLoading(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, items: cart, shippingRateId: selectedRateId })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Checkout failed.");
      }

      window.location.href = data.checkoutUrl;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkout failed.");
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <section className="catalog">
        {products.length === 0 ? (
          <div className="notice">No products synced yet.</div>
        ) : (
          products.map((product) => <ProductCard key={product.id} product={product} onAdd={addVariant} />)
        )}
      </section>

      <aside className="panel">
        <h2>Checkout</h2>
        <div className="cart-list">
          {cart.length === 0 ? (
            <p className="muted">Cart is empty.</p>
          ) : (
            cart.map((item) => (
              <div className="cart-line" key={`${item.productId}:${item.syncVariantId}`}>
                <span>{item.label}</span>
                <strong>
                  {item.quantity} x {item.price} {item.currency.toUpperCase()}
                </strong>
              </div>
            ))
          )}
        </div>

        <strong>
          Subtotal: {subtotal.toFixed(2)} {cart[0]?.currency?.toUpperCase() || ""}
        </strong>

        <form className="form-grid" onSubmit={fetchRates}>
          <label className="wide">
            Name
            <input value={recipient.name} onChange={(event) => updateRecipient("name", event.target.value)} required />
          </label>
          <label className="wide">
            Email
            <input type="email" value={recipient.email} onChange={(event) => updateRecipient("email", event.target.value)} required />
          </label>
          <label className="wide">
            Address
            <input value={recipient.address1} onChange={(event) => updateRecipient("address1", event.target.value)} required />
          </label>
          <label className="wide">
            Address 2
            <input value={recipient.address2 || ""} onChange={(event) => updateRecipient("address2", event.target.value)} />
          </label>
          <label>
            City
            <input value={recipient.city} onChange={(event) => updateRecipient("city", event.target.value)} required />
          </label>
          <label>
            ZIP
            <input value={recipient.zip} onChange={(event) => updateRecipient("zip", event.target.value)} required />
          </label>
          <label>
            State
            <input value={recipient.stateCode || ""} onChange={(event) => updateRecipient("stateCode", event.target.value)} />
          </label>
          <label>
            Country
            <select value={recipient.countryCode} onChange={(event) => updateRecipient("countryCode", event.target.value)}>
              {allowedCountries.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={cart.length === 0 || loading}>
            <Truck size={18} /> Calculate shipping
          </button>
        </form>

        {rates.length ? (
          <div className="rates">
            {rates.map((rate) => (
              <label className="rate" key={rate.id}>
                <input type="radio" checked={selectedRateId === rate.id} onChange={() => setSelectedRateId(rate.id)} />
                <span>{rate.name}</span>
                <strong>
                  {rate.rate} {rate.currency}
                </strong>
              </label>
            ))}
          </div>
        ) : null}

        <button onClick={checkout} disabled={!selectedRateId || loading}>
          <ShoppingCart size={18} /> Pay with Stripe
        </button>

        {status ? <p className="success">{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </aside>
    </div>
  );
}

function ProductCard({ product, onAdd }: { product: CatalogProduct; onAdd: (product: CatalogProduct, syncVariantId: number) => void }) {
  const activeVariants = product.variants.filter(
    (variant) => !variant.isIgnored && variant.availabilityStatus !== "out_of_stock" && variant.availabilityStatus !== "discontinued"
  );
  const [selectedVariantId, setSelectedVariantId] = useState(activeVariants[0]?.syncVariantId || 0);
  const selectedVariant = activeVariants.find((variant) => variant.syncVariantId === selectedVariantId) || activeVariants[0];

  return (
    <article className="card">
      {selectedVariant?.image || product.thumbnail ? (
        <img className="product-image" src={selectedVariant?.image || product.thumbnail} alt={product.name} />
      ) : (
        <div className="product-image" />
      )}
      <h2 className="product-title">{product.name}</h2>
      {selectedVariant ? (
        <>
          <select value={selectedVariant.syncVariantId} onChange={(event) => setSelectedVariantId(Number(event.target.value))}>
            {activeVariants.map((variant) => (
              <option key={variant.syncVariantId} value={variant.syncVariantId}>
                {variant.name}
              </option>
            ))}
          </select>
          <strong>
            {selectedVariant.retailPrice} {selectedVariant.currency.toUpperCase()}
          </strong>
          <button onClick={() => onAdd(product, selectedVariant.syncVariantId)}>
            <ShoppingCart size={18} /> Add
          </button>
        </>
      ) : (
        <p className="muted">No active variants.</p>
      )}
    </article>
  );
}
