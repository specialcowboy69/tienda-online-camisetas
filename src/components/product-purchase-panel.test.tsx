import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPurchasePanel } from "./product-purchase-panel";
import type { CatalogProduct } from "@/lib/types";

const hooks = vi.hoisted(() => ({ values: [] as unknown[], index: 0 }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useMemo: (factory: () => unknown) => factory(), useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = typeof next === "function" ? next(hooks.values[index]) : next; }];
  } };
});

const product: CatalogProduct = { id: "test-product", syncProductId: 1, name: "Test Shirt", updatedAt: "2026-09-30", variants: [{ syncVariantId: 1, variantId: 2, name: "Black / M", size: "M", color: "Black", retailPrice: "20", currency: "usd" }] };
function renderPanel() {
  hooks.index = 0;
  return ProductPurchasePanel({ product, allowedCountries: ["US"], defaultCountry: "US" });
}
type ElementProps = { children?: ReactNode; value?: unknown; required?: boolean; disabled?: boolean; onChange?: (event: { target: { value: string } }) => void; onClick?: () => void; onSubmit?: (event: { preventDefault: () => void }) => Promise<void> };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function labelInput(label: string) {
  const element = elements(renderPanel()).find((entry) => entry.type === "label" && React.Children.toArray(entry.props.children).includes(label));
  return elements(element).find((entry) => entry.type === "input")!;
}
function button(text: string) { return elements(renderPanel()).find((entry) => entry.type === "button" && renderToStaticMarkup(entry).includes(text))!; }
async function quote() { await elements(renderPanel()).find((entry) => entry.type === "form")!.props.onSubmit!({ preventDefault() {} }); }

describe("ProductPurchasePanel recipient wiring through real rendered handlers", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    hooks.values = []; hooks.index = 0;
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
});
