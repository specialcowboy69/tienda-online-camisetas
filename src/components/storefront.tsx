"use client";

import { ShoppingCart, Truck } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { ShippingEligibilityError } from "@/lib/shipping-eligibility";
import { toCartItemInputs } from "@/lib/cart";
import { getCatalogProductImage } from "@/lib/catalog-images";
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
  const [checkingOut, setCheckingOut] = useState(false);
  const revision = useRef(0);
  const pendingQuote = useRef<AbortController | null>(null);
  const checkoutLock = useRef(false);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  }, [cart]);

  function addVariant(product: CatalogProduct, syncVariantId: number) {
    if (checkoutLock.current) return;
    const variant = product.variants.find((candidate) => candidate.syncVariantId === syncVariantId);
    if (!variant) {
      return;
    }

    invalidateQuote();
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
    if (checkoutLock.current) return;
    setRecipient((current) => ({ ...current, [field]: value }));
    invalidateQuote();
    setRates([]);
    setSelectedRateId("");
  }

  function invalidateQuote() {
    revision.current += 1;
    pendingQuote.current?.abort();
    pendingQuote.current = null;
    setRates([]);
    setSelectedRateId("");
    setStatus("");
    setError("");
    setLoading(false);
  }

  async function fetchRates(event: FormEvent) {
    event.preventDefault();
    if (checkoutLock.current) return;
    invalidateQuote();
    const token = revision.current;
    const controller = new AbortController();
    pendingQuote.current = controller;
    setStatus("Checking delivery availability...");
    setLoading(true);
    try {
      const response = await fetch("/api/shipping/rates", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, items: toCartItemInputs(cart) })
      });
      const data = await response.json();
      if (token !== revision.current) return;
      if (!response.ok) {
        if (["EU_CUSTOMS_RISK", "SHIPPING_CHECK_UNAVAILABLE", "SHIPPING_OPTIONS_CHANGED"].includes(data.code)) {
          throw new ShippingEligibilityError(data.code);
        }
        throw new Error(data.error || "Shipping rates failed.");
      }
      setRates(data.rates || []);
      setSelectedRateId(data.rates?.[0]?.id || "");
      setStatus(data.rates?.length ? "Shipping options ready." : "No shipping options found.");
    } catch (caught) {
      if (token !== revision.current) return;
      setRates([]);
      setSelectedRateId("");
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Shipping rates failed.");
    } finally {
      if (token === revision.current) {
        pendingQuote.current = null;
        setLoading(false);
      }
    }
  }

  async function checkout() {
    if (checkoutLock.current || !selectedRateId || loading) return;
    checkoutLock.current = true;
    setCheckingOut(true);
    const token = ++revision.current;
    pendingQuote.current?.abort();
    setError("");
    setStatus("Checking delivery before payment...");
    setLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient, items: toCartItemInputs(cart), shippingRateId: selectedRateId })
      });
      const data = await response.json();
      if (token !== revision.current) return;
      if (!response.ok) {
        if (["EU_CUSTOMS_RISK", "SHIPPING_CHECK_UNAVAILABLE", "SHIPPING_OPTIONS_CHANGED"].includes(data.code)) {
          throw new ShippingEligibilityError(data.code);
        }
        throw new Error(data.error || "Checkout failed.");
      }
      window.location.href = data.checkoutUrl;
    } catch (caught) {
      if (token !== revision.current) return;
      setRates([]);
      setSelectedRateId("");
      setStatus("");
      setError(caught instanceof Error ? caught.message : "Checkout failed.");
      checkoutLock.current = false;
      setCheckingOut(false);
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <section className="catalog">
        {products.length === 0 ? (
          <div className="notice">No products synced yet.</div>
        ) : (
          products.map((product) => <ProductCard key={product.id} product={product} onAdd={addVariant} disabled={checkingOut} />)
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
            <input disabled={checkingOut} value={recipient.name} onChange={(event) => updateRecipient("name", event.target.value)} required />
          </label>
          <label className="wide">
            Email
            <input disabled={checkingOut} type="email" value={recipient.email} onChange={(event) => updateRecipient("email", event.target.value)} required />
          </label>
          <label className="wide">
            Address
            <input disabled={checkingOut} value={recipient.address1} onChange={(event) => updateRecipient("address1", event.target.value)} required />
          </label>
          <label className="wide">
            Address 2
            <input disabled={checkingOut} value={recipient.address2 || ""} onChange={(event) => updateRecipient("address2", event.target.value)} />
          </label>
          <label>
            City
            <input disabled={checkingOut} value={recipient.city} onChange={(event) => updateRecipient("city", event.target.value)} required />
          </label>
          <label>
            ZIP
            <input disabled={checkingOut} value={recipient.zip} onChange={(event) => updateRecipient("zip", event.target.value)} required />
          </label>
          <label>
            State
            <input disabled={checkingOut} value={recipient.stateCode || ""} onChange={(event) => updateRecipient("stateCode", event.target.value)} />
          </label>
          <label>
            Country
            <select disabled={checkingOut} value={recipient.countryCode} onChange={(event) => updateRecipient("countryCode", event.target.value)}>
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
                <input disabled={checkingOut} type="radio" checked={selectedRateId === rate.id} onChange={() => { if (!checkoutLock.current) setSelectedRateId(rate.id); }} />
                <span>{rate.name}</span>
                <strong>
                  {Number(rate.rate) === 0 ? "Free" : `${rate.rate} ${rate.currency}`}
                </strong>
              </label>
            ))}
          </div>
        ) : null}

        <button onClick={checkout} disabled={!selectedRateId || loading}>
          <ShoppingCart size={18} /> Pay with Stripe
        </button>

        {status ? <p role="status" className="success">{status}</p> : null}
        {error ? <p role="alert" className="error">{error}</p> : null}
      </aside>
    </div>
  );
}

function ProductCard({ product, onAdd, disabled }: { product: CatalogProduct; onAdd: (product: CatalogProduct, syncVariantId: number) => void; disabled: boolean }) {
  const activeVariants = product.variants.filter(
    (variant) => !variant.isIgnored && variant.availabilityStatus !== "out_of_stock" && variant.availabilityStatus !== "discontinued"
  );
  const [selectedVariantId, setSelectedVariantId] = useState(activeVariants[0]?.syncVariantId || 0);
  const selectedVariant = activeVariants.find((variant) => variant.syncVariantId === selectedVariantId) || activeVariants[0];
  const productImage = getCatalogProductImage(product, selectedVariant);

  return (
    <article className="card">
      {productImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="product-image" src={productImage} alt={product.name} />
      ) : (
        <div className="product-image" />
      )}
      <h2 className="product-title">{product.name}</h2>
      {selectedVariant ? (
        <>
          <select disabled={disabled} value={selectedVariant.syncVariantId} onChange={(event) => { if (!disabled) setSelectedVariantId(Number(event.target.value)); }}>
            {activeVariants.map((variant) => (
              <option key={variant.syncVariantId} value={variant.syncVariantId}>
                {variant.name}
              </option>
            ))}
          </select>
          <strong>
            {selectedVariant.retailPrice} {selectedVariant.currency.toUpperCase()}
          </strong>
          <button disabled={disabled} onClick={() => onAdd(product, selectedVariant.syncVariantId)}>
            <ShoppingCart size={18} /> Add
          </button>
        </>
      ) : (
        <p className="muted">No active variants.</p>
      )}
    </article>
  );
}
