import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Storefront } from "./storefront";
import type { CatalogProduct } from "@/lib/types";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0, refs: [] as { current: unknown }[], refIndex: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useMemo: (factory: () => unknown) => factory(), useRef: (initial: unknown) => { const i = hooks.refIndex++; return hooks.refs[i] ??= { current: initial }; }, useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  } };
});

const product: CatalogProduct = { id: "test-product", syncProductId: 1, name: "Test Shirt", updatedAt: "2026-09-30", variants: [{ syncVariantId: 1, variantId: 2, name: "Black / M", size: "M", color: "Black", retailPrice: "20", currency: "usd" }] };
function renderPanel() {
  hooks.index = 0;
  hooks.refIndex = 0;
  return Storefront({ products: [product], allowedCountries: ["US", "ES"], defaultCountry: "US" });
}
type ElementProps = { children?: ReactNode; value?: unknown; required?: boolean; disabled?: boolean; onChange?: (event: { target: { value: string } }) => void; onClick?: () => void; onAdd?: (product: CatalogProduct, id: number) => void; onSubmit?: (event: { preventDefault: () => void }) => Promise<void> };
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

describe("Storefront recipient wiring through real rendered handlers", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    hooks.values = []; hooks.index = 0; hooks.refs = []; hooks.refIndex = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ rates: [{ id: "STANDARD", name: "Standard", rate: "0", currency: "usd" }] }))));
    elements(renderPanel()).find(entry => typeof entry.props.onAdd === "function")!.props.onAdd!(product, 1);
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it("saves optional apartment edits and removes the old payable shipping quote", async () => {
    await quote();
    expect(button("Pay with Stripe").props.disabled).toBe(false);
    const input = labelInput("Address 2");
    expect(input.props.required).not.toBe(true);
    input.props.onChange!({ target: { value: "Apt 42" } });
    expect(labelInput("Address 2").props.value).toBe("Apt 42");
    expect(button("Pay with Stripe").props.disabled).toBe(true);
    await quote();
    expect(JSON.parse(vi.mocked(fetch).mock.calls[1][1]!.body as string).recipient.address2).toBe("Apt 42");
  });
  it("removes the payable quote after other delivery details change", async () => {
    await quote(); labelInput("Name").props.onChange!({ target: { value: "Ada" } });
    expect(labelInput("Name").props.value).toBe("Ada");
    expect(button("Pay with Stripe").props.disabled).toBe(true);
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

  it("ignores rates for the previous cart quantity", async () => {
    const pending = deferred(); vi.mocked(fetch).mockReturnValueOnce(pending.promise);
    const old = quote(); elements(renderPanel()).find(entry => typeof entry.props.onAdd === "function")!.props.onAdd!(product, 1);
    pending.resolve(success()); await old;
    expect(button("Pay with Stripe")?.props.disabled ?? true).toBe(true);
  });
});
