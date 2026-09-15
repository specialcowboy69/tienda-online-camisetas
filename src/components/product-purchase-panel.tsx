"use client";

import { ShoppingBag, Truck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { toCartItemInputs } from "@/lib/cart";
import { productContentById } from "@/lib/product-content";
import { getActiveProductVariants, getProductOptions, getProductPriceSummary, getSizesForColor, getVariantForSelection } from "@/lib/product-view";
import { SizeGuide } from "@/lib/size-guides";
import { CatalogProduct, CartItemInput, Recipient, ShippingRate } from "@/lib/types";
import { SizeGuideModal } from "./size-guide-modal";

type ProductPurchasePanelProps = {
  product: CatalogProduct;
  allowedCountries: string[];
  defaultCountry: string;
  sizeGuide?: SizeGuide;
};

type CartLine = CartItemInput & {
  label: string;
  price: string;
  currency: string;
};

function formatPrice(price?: string, currency?: string) {
  if (!price || !currency) {
    return "";
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase()
    }).format(Number(price));
  } catch {
    return `${price} ${currency.toUpperCase()}`;
  }
}

export function ProductPurchasePanel({ product, allowedCountries, defaultCountry, sizeGuide }: ProductPurchasePanelProps) {
  const content = productContentById[product.id];
  const activeVariants = useMemo(() => getActiveProductVariants(product), [product]);
  const options = useMemo(() => getProductOptions(product), [product]);
  const firstVariant = activeVariants[0];
  const [selectedColor, setSelectedColor] = useState(firstVariant?.color || "");
  const [selectedSize, setSelectedSize] = useState(firstVariant?.size || "");
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
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);

  const selectedVariant = getVariantForSelection(product, { color: selectedColor, size: selectedSize }) || firstVariant;
  const availableSizes = getSizesForColor(product, selectedColor);
  const price = getProductPriceSummary(product);
  const priceLabel = selectedVariant
    ? formatPrice(selectedVariant.retailPrice, selectedVariant.currency)
    : price
      ? `${price.isRange ? "From " : ""}${formatPrice(price.min, price.currency)}`
      : "Unavailable";

  function chooseColor(color: string) {
    const nextVariant = activeVariants.find((variant) => variant.color === color) || firstVariant;
    setSelectedColor(color);
    setSelectedSize(nextVariant?.size || "");
    resetCheckout();
  }

  function chooseSize(size: string) {
    setSelectedSize(size);
    resetCheckout();
  }

  function resetCheckout() {
    setCart([]);
    setRates([]);
    setSelectedRateId("");
    setStatus("");
    setError("");
  }

  function addToBag() {
    if (!selectedVariant) {
      return;
    }

    setCart([
      {
        productId: product.id,
        syncVariantId: selectedVariant.syncVariantId,
        quantity: 1,
        label: `${product.name} - ${selectedVariant.name}`,
        price: selectedVariant.retailPrice,
        currency: selectedVariant.currency
      }
    ]);
    setRates([]);
    setSelectedRateId("");
    setStatus("Added. Enter your address to see shipping options.");
    setError("");
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
        body: JSON.stringify({ recipient, items: toCartItemInputs(cart) })
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
        body: JSON.stringify({ recipient, items: toCartItemInputs(cart), shippingRateId: selectedRateId })
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
    <aside className="ncc-buybox" aria-label="Product purchase options">
      <p className="ncc-microcopy">No Context Club</p>
      <h1>{product.name}</h1>
      <p className="ncc-price">{priceLabel}</p>
      {content ? <p className="ncc-buybox__summary">{content.summary}</p> : null}

      {options.colors.length ? (
        <fieldset className="ncc-option-group">
          <legend>Color {selectedColor ? <span>{selectedColor}</span> : null}</legend>
          <div className="ncc-choice-row">
            {options.colors.map((color) => (
              <button
                aria-pressed={selectedColor === color}
                className="ncc-choice"
                key={color}
                onClick={() => chooseColor(color)}
                type="button"
              >
                {color}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {options.sizes.length ? (
        <fieldset className="ncc-option-group">
          <legend>
            Size
            {sizeGuide ? (
              <button className="ncc-inline-button" type="button" onClick={() => setIsSizeGuideOpen(true)}>
                Size guide
              </button>
            ) : null}
          </legend>
          <div className="ncc-choice-row">
            {(availableSizes.length ? availableSizes : options.sizes).map((size) => (
              <button
                aria-pressed={selectedSize === size}
                className="ncc-choice ncc-choice--square"
                key={size}
                onClick={() => chooseSize(size)}
                type="button"
              >
                {size}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <button className="ncc-primary-button" disabled={!selectedVariant || loading} onClick={addToBag} type="button">
        <ShoppingBag size={20} strokeWidth={2} />
        Add to bag
      </button>

      <p className="ncc-buybox__shipping">
        <Truck size={18} strokeWidth={2} /> Standard shipping included. Options shown at checkout.
      </p>

      {cart.length ? (
        <form className="ncc-checkout-form" onSubmit={fetchRates}>
          <h2>Checkout details</h2>
          <label>
            Name
            <input value={recipient.name} onChange={(event) => updateRecipient("name", event.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={recipient.email} onChange={(event) => updateRecipient("email", event.target.value)} required />
          </label>
          <label className="ncc-form-wide">
            Address
            <input value={recipient.address1} onChange={(event) => updateRecipient("address1", event.target.value)} required />
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
          <button className="ncc-secondary-button ncc-form-wide" type="submit" disabled={cart.length === 0 || loading}>
            Calculate shipping
          </button>
        </form>
      ) : null}

      {rates.length ? (
        <div className="ncc-rates">
          {rates.map((rate) => (
            <label className="ncc-rate" key={rate.id}>
              <input type="radio" checked={selectedRateId === rate.id} onChange={() => setSelectedRateId(rate.id)} />
              <span>{rate.name}</span>
              <strong>{Number(rate.rate) === 0 ? "Included" : `${rate.rate} ${rate.currency}`}</strong>
            </label>
          ))}
          <button className="ncc-primary-button" onClick={checkout} disabled={!selectedRateId || loading} type="button">
            Pay with Stripe
          </button>
        </div>
      ) : null}

      {status ? <p className="success">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {sizeGuide ? (
        <SizeGuideModal guide={sizeGuide} isOpen={isSizeGuideOpen} onClose={() => setIsSizeGuideOpen(false)} productName={product.name} />
      ) : null}
    </aside>
  );
}
