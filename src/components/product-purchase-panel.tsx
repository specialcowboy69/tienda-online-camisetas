"use client";

import { ShoppingBag, Truck } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { ShippingEligibilityError } from "@/lib/shipping-eligibility";
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

function toDisplayCase(value: string) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
}

function toSentenceCase(value: string) {
  const lower = value.toLowerCase();
  return lower ? `${lower[0].toUpperCase()}${lower.slice(1)}` : lower;
}

function getGarmentLabel(content?: (typeof productContentById)[string]) {
  const specsTitle = content?.specsTitle.toLowerCase() || "";
  const heading = content?.heading.toLowerCase() || "";

  if (specsTitle.includes("hoodie")) {
    return "Cropped Hoodie";
  }

  if (heading.includes("crop")) {
    return "Crop Top";
  }

  return "Graphic Tee";
}

function getDisplayTitle(productName: string, content?: (typeof productContentById)[string]) {
  const title = toDisplayCase(productName);
  const normalized = title.toLowerCase();

  if (normalized.includes("tee") || normalized.includes("hoodie") || normalized.includes("crop top")) {
    return title;
  }

  return `${title} ${getGarmentLabel(content)}`;
}

function getDisplayMood(content?: (typeof productContentById)[string]) {
  if (!content) {
    return "";
  }

  const sentence = toSentenceCase(content.heading).replace(/\.$/, "");
  return `${sentence}.`;
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
  const [checkingOut, setCheckingOut] = useState(false);
  const revision = useRef(0);
  const pendingQuote = useRef<AbortController | null>(null);
  const checkoutLock = useRef(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);

  const selectedVariant = getVariantForSelection(product, { color: selectedColor, size: selectedSize }) || firstVariant;
  const availableSizes = getSizesForColor(product, selectedColor);
  const price = getProductPriceSummary(product);
  const priceLabel = selectedVariant
    ? formatPrice(selectedVariant.retailPrice, selectedVariant.currency)
    : price
      ? `${price.isRange ? "From " : ""}${formatPrice(price.min, price.currency)}`
      : "Unavailable";
  const displayTitle = getDisplayTitle(product.name, content);
  const displayMood = getDisplayMood(content);

  function chooseColor(color: string) {
    if (checkoutLock.current) return;
    const nextVariant = activeVariants.find((variant) => variant.color === color) || firstVariant;
    setSelectedColor(color);
    setSelectedSize(nextVariant?.size || "");
    resetCheckout();
  }

  function chooseSize(size: string) {
    if (checkoutLock.current) return;
    setSelectedSize(size);
    resetCheckout();
  }

  function resetCheckout() {
    invalidateQuote();
    setCart([]);
    setRates([]);
    setSelectedRateId("");
    setStatus("");
    setError("");
  }

  function addToBag() {
    if (checkoutLock.current) return;
    if (!selectedVariant) {
      return;
    }

    invalidateQuote();
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
    <aside className="ncc-buybox" id="product-purchase" aria-label="Product purchase options">
      <p className="ncc-microcopy">{content ? "Pet drama" : "No Context Club"}</p>
      <h1>{displayTitle}</h1>
      <p className="ncc-price">{priceLabel}</p>
      {displayMood ? <p className="ncc-buybox__mood">{displayMood}</p> : null}
      {content ? <p className="ncc-buybox__summary">{content.summary}</p> : null}

      {options.colors.length ? (
        <fieldset className="ncc-option-group">
          <legend>Color {selectedColor ? <span>{selectedColor}</span> : null}</legend>
          <div className="ncc-choice-row">
            {options.colors.map((color) => (
              <button
                disabled={checkingOut}
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
                disabled={checkingOut}
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
        <Truck size={18} strokeWidth={2} /> Shipping options and costs shown at checkout.
      </p>

      {cart.length ? (
        <form className="ncc-checkout-form" onSubmit={fetchRates}>
          <h2>Checkout details</h2>
          <label>
            Name
            <input disabled={checkingOut} value={recipient.name} onChange={(event) => updateRecipient("name", event.target.value)} required />
          </label>
          <label>
            Email
            <input disabled={checkingOut} type="email" value={recipient.email} onChange={(event) => updateRecipient("email", event.target.value)} required />
          </label>
          <label className="ncc-form-wide">
            Address
            <input disabled={checkingOut} value={recipient.address1} onChange={(event) => updateRecipient("address1", event.target.value)} required />
          </label>
          <label className="ncc-form-wide">
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
          <p className="ncc-form-wide">We use your contact and delivery details to calculate shipping and process your order. See our <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy policy (opens in a new tab)</a>.</p>
          <button className="ncc-secondary-button ncc-form-wide" type="submit" disabled={cart.length === 0 || loading}>
            Calculate shipping
          </button>
        </form>
      ) : null}

      {rates.length ? (
        <div className="ncc-rates">
          {rates.map((rate) => (
            <label className="ncc-rate" key={rate.id}>
              <input disabled={checkingOut} type="radio" checked={selectedRateId === rate.id} onChange={() => { if (!checkoutLock.current) setSelectedRateId(rate.id); }} />
              <span>{rate.name}</span>
              <strong>{Number(rate.rate) === 0 ? "Included" : `${rate.rate} ${rate.currency}`}</strong>
            </label>
          ))}
          <button className="ncc-primary-button" onClick={checkout} disabled={!selectedRateId || loading} type="button">
            Pay with Stripe
          </button>
        </div>
      ) : null}

      {status ? <p role="status" className="success">{status}</p> : null}
      {error ? <p role="alert" className="error">{error}</p> : null}

      {sizeGuide ? (
        <SizeGuideModal guide={sizeGuide} isOpen={isSizeGuideOpen} onClose={() => setIsSizeGuideOpen(false)} productName={product.name} />
      ) : null}
    </aside>
  );
}
