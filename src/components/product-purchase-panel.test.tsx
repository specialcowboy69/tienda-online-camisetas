import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPurchasePanel } from "./product-purchase-panel";
import type { CatalogProduct } from "@/lib/types";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, refs: [] as { current: unknown }[], refIndex: 0, cleanups: [] as Array<() => void> }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useMemo: (factory: () => unknown) => factory(), useEffect: (effect: () => void | (() => void)) => { const cleanup = effect(); if (cleanup) hooks.cleanups.push(cleanup); }, useRef: (initial: unknown) => { const i = hooks.refIndex++; return hooks.refs[i] ??= { current: initial }; }, useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  } };
});

const product: CatalogProduct = { id: "test-product", syncProductId: 1, name: "Test Shirt", updatedAt: "2026-09-30", variants: [{ syncVariantId: 1, variantId: 2, name: "Black / M", size: "M", color: "Black", retailPrice: "20", currency: "usd" }] };
function renderPanel() {
  hooks.index = 0;
  hooks.refIndex = 0;
  return ProductPurchasePanel({ product, allowedCountries: ["US", "ES"], defaultCountry: "US" });
}
const variantProduct: CatalogProduct = { ...product, variants: [
  { syncVariantId: 11, variantId: 111, name: "Black / M", color: "Black", size: "M", retailPrice: "29", currency: "USD", image: "https://example.com/black.webp" },
  { syncVariantId: 22, variantId: 222, name: "Blue / L", color: "Blue", size: "L", retailPrice: "31", currency: "USD", image: "https://example.com/blue.webp" }
] };
function renderVariantPanel(initialVariantId?: number) {
  hooks.index = 0;
  hooks.refIndex = 0;
  return ProductPurchasePanel({ product: variantProduct, allowedCountries: ["US"], defaultCountry: "US", initialVariantId });
}
type ElementProps = { children?: ReactNode; value?: unknown; required?: boolean; disabled?: boolean; "aria-pressed"?: boolean; onChange?: (event: { target: { value: string } }) => void; onClick?: () => void; onSubmit?: (event: { preventDefault: () => void }) => Promise<void> };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function labelInput(label: string) {
  const element = elements(renderPanel()).find((entry) => entry.type === "label" && React.Children.toArray(entry.props.children).includes(label));
  return elements(element).find((entry) => (entry.type === "input" || entry.type === "select"))!;
}
function button(text: string) { return elements(renderPanel()).find((entry) => entry.type === "button" && renderToStaticMarkup(entry).includes(text))!; }
async function quote() { await elements(renderPanel()).find((entry) => entry.type === "form")!.props.onSubmit!({ preventDefault() {} }); }

function success() { return new Response(JSON.stringify({ rates: [{ id: "STANDARD", name: "Standard", rate: "0", currency: "usd" }] })); }
function deferred() { let resolve!: (response: Response) => void; const promise = new Promise<Response>(done => { resolve = done; }); return { promise, resolve }; }

describe("ProductPurchasePanel recipient wiring through real rendered handlers", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    hooks.values = []; hooks.index = 0; hooks.refs = []; hooks.refIndex = 0;
    hooks.cleanups = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ rates: [{ id: "STANDARD", name: "Standard", rate: "0", currency: "usd" }] }))));
    button("Add to bag").props.onClick!();
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("saves optional apartment edits and removes the old payable shipping quote", async () => {
    await quote();
    expect(button("Pay with Stripe").props.disabled).toBe(false);
    const input = labelInput("Address 2");
    expect(input.props.required).not.toBe(true);
    input.props.onChange!({ target: { value: "Apt 42" } });
    expect(labelInput("Address 2").props.value).toBe("Apt 42");
    expect(renderToStaticMarkup(renderPanel())).not.toContain("Pay with Stripe");
    await quote();
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).recipient.address2).toBe("Apt 42");
  });
  it("removes the payable quote after other delivery details change", async () => {
    await quote(); labelInput("Name").props.onChange!({ target: { value: "Ada" } });
    expect(labelInput("Name").props.value).toBe("Ada");
    expect(renderToStaticMarkup(renderPanel())).not.toContain("Pay with Stripe");
  });

  it("does not promise included standard shipping before the destination is known", () => {
    const html = renderToStaticMarkup(renderPanel());
    expect(html).toContain("Shipping options and costs shown at checkout.");
    expect(html).not.toContain("Standard shipping included.");
  });

  it("links the privacy information where the customer enters delivery details", () => {
    const html = renderToStaticMarkup(renderPanel());
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Privacy policy");
    expect(html).toContain('href="/privacy" target="_blank" rel="noopener noreferrer"');
    expect(html.indexOf("Privacy policy")).toBeLessThan(html.indexOf("Calculate shipping"));
  });

  it.each(["EU_CUSTOMS_RISK", "SHIPPING_CHECK_UNAVAILABLE", "SHIPPING_OPTIONS_CHANGED"])("clears payable rates after %s from either endpoint and preserves address", async code => {
    labelInput("Address 2").props.onChange!({ target: { value: "Apt 7" } });
    await quote();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code, error: "Delivery needs checking." }), { status: 409 }));
    await button("Pay with Stripe").props.onClick!();
    expect(button("Pay with Stripe")?.props.disabled ?? true).toBe(true);
    expect(renderToStaticMarkup(renderPanel())).toContain('role="alert"');
    expect(labelInput("Address 2").props.value).toBe("Apt 7");
    await quote();
    expect(button("Pay with Stripe").props.disabled).toBe(false);
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ code, error: "Delivery needs checking." }), { status: 503 }));
    await quote();
    expect(button("Pay with Stripe")?.props.disabled ?? true).toBe(true);
  });
  it.each(["Address 2", "Country"])("ignores late success after %s changes", async field => {
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const old = quote();
    labelInput(field).props.onChange!({ target: { value: field === "Country" ? "ES" : "New apartment" } });
    pending.resolve(success());
    await old;
    expect(button("Pay with Stripe")?.props.disabled ?? true).toBe(true);
    await quote();
    expect(button("Pay with Stripe").props.disabled).toBe(false);
  });
  it("does not restore rates or clear loading when an older request finishes", async () => {
    const first = deferred(), second = deferred();
    vi.mocked(fetch).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const old = quote(), current = quote();
    first.resolve(success()); await old;
    expect(button("Calculate shipping").props.disabled).toBe(true);
    expect(button("Pay with Stripe")?.props.disabled ?? true).toBe(true);
    second.resolve(success()); await current;
    expect(button("Pay with Stripe").props.disabled).toBe(false);
  });
  it("ignores an old error after a newer quote succeeded", async () => {
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const old = quote();
    await quote();
    pending.resolve(new Response(JSON.stringify({ error: "Old error" }), { status: 503 }));
    await old;
    expect(button("Pay with Stripe").props.disabled).toBe(false);
    expect(renderToStaticMarkup(renderPanel())).not.toContain("Old error");
  });
  it("locks purchase controls and handlers until checkout finishes", async () => {
    await quote();
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const checkout = button("Pay with Stripe").props.onClick!();
    expect(labelInput("Name").props.disabled).toBe(true);
    labelInput("Name").props.onChange!({ target: { value: "Should not change" } });
    expect(labelInput("Name").props.value).toBe("");
    expect(renderToStaticMarkup(renderPanel())).toContain('role="status"');
    pending.resolve(new Response(JSON.stringify({ code: "SHIPPING_CHECK_UNAVAILABLE" }), { status: 503 }));
    await checkout;
    expect(labelInput("Name").props.disabled).toBe(false);
    expect(button("Pay with Stripe")?.props.disabled ?? true).toBe(true);
  });

  it("ignores rates for a previous size selection", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const old = quote(); button("M").props.onClick!();
    pending.resolve(success()); await old;
    expect(button("Pay with Stripe")?.props.disabled ?? true).toBe(true);
  });
});

describe("ProductPurchasePanel URL variant selection", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    hooks.values = []; hooks.index = 0; hooks.refs = []; hooks.refIndex = 0;
    hooks.cleanups = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ rates: [{ id: "STANDARD", name: "Standard", rate: "0", currency: "USD" }] }))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("initially selects Blue/L, shows its price and sends exactly variant 22 to the bag quote", async () => {
    const html = renderToStaticMarkup(renderVariantPanel(22));
    expect(html).toContain("$31.00");
    expect(elements(renderVariantPanel(22)).find(entry => entry.type === "button" && entry.props.children === "Blue")?.props["aria-pressed"]).toBe(true);
    expect(elements(renderVariantPanel(22)).find(entry => entry.type === "button" && entry.props.children === "L")?.props["aria-pressed"]).toBe(true);
    const add = elements(renderVariantPanel(22)).find(entry => entry.type === "button" && renderToStaticMarkup(entry).includes("Add to bag"))!;
    add.props.onClick!();
    const form = elements(renderVariantPanel(22)).find(entry => entry.type === "form")!;
    await form.props.onSubmit!({ preventDefault() {} });
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string).items).toEqual([{ productId: "test-product", syncVariantId: 22, quantity: 1 }]);
  });

  it("starts a fresh keyed instance without the previous bag or payable quote", async () => {
    elements(renderVariantPanel(22)).find(entry => entry.type === "button" && renderToStaticMarkup(entry).includes("Add to bag"))!.props.onClick!();
    await elements(renderVariantPanel(22)).find(entry => entry.type === "form")!.props.onSubmit!({ preventDefault() {} });
    expect(renderToStaticMarkup(renderVariantPanel(22))).toContain("Pay with Stripe");
    hooks.values = []; hooks.refs = [];
    const html = renderToStaticMarkup(renderVariantPanel(11));
    expect(html).toContain("$29.00");
    expect(html).not.toContain("Pay with Stripe");
    expect(html).not.toContain("Calculate shipping");
  });

  it("aborts an old quote on unmount so its result cannot become payable", async () => {
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    elements(renderVariantPanel(22)).find(entry => entry.type === "button" && renderToStaticMarkup(entry).includes("Add to bag"))!.props.onClick!();
    const old = elements(renderVariantPanel(22)).find(entry => entry.type === "form")!.props.onSubmit!({ preventDefault() {} });
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal;
    hooks.cleanups.forEach(cleanup => cleanup());
    expect(signal?.aborted).toBe(true);
    pending.resolve(success());
    await old;
  });

  it("ignores a checkout response from a panel unmounted during query navigation", async () => {
    vi.stubGlobal("window", { location: { href: "original" } });
    elements(renderVariantPanel(22)).find(entry => entry.type === "button" && renderToStaticMarkup(entry).includes("Add to bag"))!.props.onClick!();
    await elements(renderVariantPanel(22)).find(entry => entry.type === "form")!.props.onSubmit!({ preventDefault() {} });
    const pending = deferred();
    vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const checkout = elements(renderVariantPanel(22)).find(entry => entry.type === "button" && renderToStaticMarkup(entry).includes("Pay with Stripe"))!.props.onClick!();
    hooks.cleanups.forEach(cleanup => cleanup());
    pending.resolve(new Response(JSON.stringify({ checkoutUrl: "https://checkout.example/session" })));
    await expect(checkout).resolves.toBeUndefined();
    expect(window.location.href).toBe("original");
  });
});
