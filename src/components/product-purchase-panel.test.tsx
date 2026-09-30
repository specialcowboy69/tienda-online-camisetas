import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPurchasePanel } from "./product-purchase-panel";
import type { CatalogProduct, Recipient } from "@/lib/types";

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
type ElementProps = { children?: ReactNode; value?: unknown; required?: boolean; onChange?: (event: { target: { value: string } }) => void };
function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
describe("ProductPurchasePanel recipient wiring", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    hooks.values = []; hooks.index = 0;
    renderPanel();
    hooks.values[2] = [{ productId: product.id, syncVariantId: 1, quantity: 1 }];
    hooks.values[4] = [{ id: "STANDARD", name: "Standard", rate: "0", currency: "usd" }];
    hooks.values[5] = "STANDARD";
  });
  it("renders optional Address 2 and saves apartment edits while clearing the shipping quote", () => {
    const tree = renderPanel();
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Address 2");
    const label = elements(tree).find((element) => element.type === "label" && React.Children.toArray(element.props.children).includes("Address 2"));
    expect(label).toBeDefined();
    const input = elements(label).find((element) => element.type === "input")!;
    expect(input.props.required).not.toBe(true);
    input.props.onChange!({ target: { value: "Apt 42" } });
    expect((hooks.values[3] as Recipient).address2).toBe("Apt 42");
    expect(hooks.values[4]).toEqual([]);
    expect(hooks.values[5]).toBe("");
    expect(renderToStaticMarkup(renderPanel())).toContain('value="Apt 42"');
  });
  it("clears rates and selection after other recipient edits", () => {
    const input = elements(renderPanel()).find((element) => element.type === "input" && element.props.required === true)!;
    input.props.onChange!({ target: { value: "Ada" } });
    expect((hooks.values[3] as Recipient).name).toBe("Ada");
    expect(hooks.values[4]).toEqual([]);
    expect(hooks.values[5]).toBe("");
  });
});
