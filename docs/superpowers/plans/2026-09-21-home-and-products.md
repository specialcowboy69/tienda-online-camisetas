# No Context Club Home and Products Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical storefront on `/` with the approved No Context Club discovery home and make `/products` safely render the real first drop, including honest empty and unavailable states.

**Architecture:** Keep routes as dynamic server components. Add one small catalog-state boundary so `/` and `/products` consume the same safe result instead of leaking Firestore errors. Add a server-rendered `HomePageContent` component responsible only for the six editorial home sections, reusing `SiteHeader`, `ProductCard`, the established `ncc-*` CSS system, and real catalog image/slug helpers.

**Tech Stack:** Next.js 15 App Router, React 19 server components, TypeScript, Firebase Admin/Firestore, Vitest, ESLint, CSS in `src/app/globals.css`.

**Spec:** `docs/STOREFRONT_HOME_AND_PRODUCTS.md`; creative source: `C:\Users\USUARIO\Downloads\experto-diseño-web\docs\no-context-club\README.md`.

## Global Constraints

- Customer-facing copy, visible empty states, and errors are English-first.
- Use Firestore/Printful-backed `CatalogProduct` data for names, prices, variants, availability, and imagery; never hardcode mockup data.
- Resolve catalog imagery through `getCatalogProductImage(product)` and public product destinations through `getProductSlug(product)`.
- Do not add filters, categories, false `Best Sellers`, discounts, ratings, urgency, testimonials, or generic sustainability claims to a five-product launch catalog.
- A product without a public slug routes to `/products`, never to a guessed PDP URL.
- Do not show Firebase errors, environment details, catalog-sync instructions, or an `Admin` link in the public storefront.
- Keep existing PDP, cart, checkout, Stripe, Printful, API routes, product content, and supplier claims unchanged.
- The mockup PNGs are visual references only. Do not copy or serve them as retail product assets.
- Do not stage or commit changes unless the user explicitly authorizes a commit.

## Review Focus

- Firestore throws before returning data: both routes should show an English unavailable state and no implementation detail.
- Firestore succeeds with no public products: `/products` should show the approved empty state, and home must not render broken cards or image placeholders.
- A catalog product has no mapped slug: every card and home proof link must land at `/products`, not a nonexistent PDP.
- A catalog product has no manual or Printful image: home remains an intentional typography-first layout and does not render a broken `<img>`.
- The user follows `About` from `/products` on narrow mobile: navigation must resolve to the home `#about` landmark without horizontal overflow.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/public-catalog.ts` | Converts the Firestore catalog read into a customer-safe `{ products, status }` result. |
| `src/lib/public-catalog.test.ts` | Pins successful and failed catalog reads without requiring Firebase. |
| `src/components/home-page-content.tsx` | Server-rendered six-section home composition; receives catalog state, reuses existing display helpers and has no checkout logic. |
| `src/components/home-page-content.test.tsx` | Static-rendering tests for approved hero, no-slug routing, missing imagery, and the real `about` anchor. |
| `src/app/page.tsx` | Loads the public catalog result and renders `HomePageContent`; removes the public technical checkout/admin shell. |
| `src/app/products/page.tsx` | Uses the shared public catalog result and supplies safe empty/unavailable states to the existing product listing. |
| `src/app/customer-language.test.ts` | Extends the public-copy suite so the new server home and product states stay English-first. |
| `src/app/globals.css` | Adds scoped `ncc-home-*` and catalog-state layout rules plus mobile rules without altering PDP component contracts. |

### Task 1: Create the safe public catalog boundary

**Files:**
- Create: `src/lib/public-catalog.ts`
- Create: `src/lib/public-catalog.test.ts`

**Interfaces:**
- Consumes: `listCatalogProducts(): Promise<CatalogProduct[]>` from `src/lib/firestore.ts`.
- Produces: `PublicCatalogResult` and `getPublicCatalog(): Promise<PublicCatalogResult>` for both page routes.

- [ ] **Step 1: Write the failing public-catalog tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { listCatalogProducts } from "./firestore";
import { getPublicCatalog } from "./public-catalog";

vi.mock("./firestore", () => ({ listCatalogProducts: vi.fn() }));

it("returns public products when the catalog is available", async () => {
  vi.mocked(listCatalogProducts).mockResolvedValue([product]);
  await expect(getPublicCatalog()).resolves.toEqual({ products: [product], status: "available" });
});

it("does not expose a catalog read error", async () => {
  vi.mocked(listCatalogProducts).mockRejectedValue(new Error("missing FIREBASE_PROJECT_ID"));
  await expect(getPublicCatalog()).resolves.toEqual({ products: [], status: "unavailable" });
});
```

Use a complete `CatalogProduct` fixture with one active USD variant; do not connect the test to Firebase.

- [ ] **Step 2: Run the focused test and confirm that it fails because the module does not exist**

Run: `npx.cmd vitest run --environment node src/lib/public-catalog.test.ts`

Expected: FAIL with a module-not-found error for `./public-catalog`.

- [ ] **Step 3: Implement the boundary with a closed status union**

```ts
import { listCatalogProducts } from "./firestore";
import type { CatalogProduct } from "./types";

export type PublicCatalogResult = {
  products: CatalogProduct[];
  status: "available" | "unavailable";
};

export async function getPublicCatalog(): Promise<PublicCatalogResult> {
  try {
    return { products: await listCatalogProducts(), status: "available" };
  } catch {
    return { products: [], status: "unavailable" };
  }
}
```

Do not log or return the caught error from this helper. Firestore already
removes ignored products in `listCatalogProducts()`; do not repeat that filter.

- [ ] **Step 4: Run the focused public-catalog test**

Run: `npx.cmd vitest run --environment node src/lib/public-catalog.test.ts`

Expected: PASS with both available and unavailable catalog states covered.

- [ ] **Step 5: Check the task diff before moving on**

Run: `git diff --check -- src/lib/public-catalog.ts src/lib/public-catalog.test.ts`

Expected: no output.

### Task 2: Build the testable six-section home composition

**Files:**
- Create: `src/components/home-page-content.tsx`
- Create: `src/components/home-page-content.test.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `PublicCatalogResult` from `src/lib/public-catalog.ts`, `CatalogProduct` from `src/lib/types.ts`, `SiteHeader`, `ProductCard`, `getCatalogProductImage`, and `getProductSlug`.
- Produces: `HomePageContent({ catalog }: { catalog: PublicCatalogResult })`, a synchronous server component consumed by `src/app/page.tsx`.

- [ ] **Step 1: Write the failing static-render tests for the home component**

```tsx
const availableCatalog = { products: [productWithSlugAndImage, productWithoutSlug], status: "available" } as const;
const html = renderToStaticMarkup(createElement(HomePageContent, { catalog: availableCatalog }));

expect(html).toContain("Funny graphic tees for whatever that was.");
expect(html).toContain('id="about"');
expect(html).toContain("No context for the joke. Full context for the tee.");
expect(html).toContain('href="/products/falling-apart-cat-graphic-tee"');
expect(html).toContain('href="/products"');
expect(html).not.toContain("Admin");
```

Add two further tests in the same file:

```tsx
expect(renderToStaticMarkup(createElement(HomePageContent, {
  catalog: { products: [], status: "available" }
}))).not.toContain("ncc-product-card");

expect(renderToStaticMarkup(createElement(HomePageContent, {
  catalog: { products: [], status: "unavailable" }
}))).toContain("The shop is temporarily unavailable. Please try again soon.");
```

For the no-slug product fixture, use an ID absent from `productSlugEntries`.
Give its image fields `undefined`; assert the output has no `src="undefined"`.

- [ ] **Step 2: Run the home-component test and confirm it fails before implementation**

Run: `npx.cmd vitest run --environment node src/components/home-page-content.test.tsx`

Expected: FAIL with a module-not-found error for `./home-page-content`.

- [ ] **Step 3: Implement `HomePageContent` using existing components and helpers**

Implement this exact public shape:

```tsx
export function HomePageContent({ catalog }: { catalog: PublicCatalogResult }) {
  const featuredProducts = catalog.products.filter((product) => Boolean(getProductSlug(product))).slice(0, 3);
  const firstFeaturedProduct = featuredProducts[0];
  const firstFeaturedImage = firstFeaturedProduct ? getCatalogProductImage(firstFeaturedProduct) : undefined;
  const firstFeaturedHref = firstFeaturedProduct && getProductSlug(firstFeaturedProduct)
    ? `/products/${getProductSlug(firstFeaturedProduct)}`
    : "/products";

  // Render the approved sections inside <main className="ncc-page ncc-home">.
}
```

Render, in this semantic order:

1. `<SiteHeader />` followed by the hero H1, approved support copy and a Link
   to `/products` labeled `Shop the first drop`.
2. `The First Drop` with `Small drop. Big energy.`, `Five designs. Zero need
   to explain them.`, up to three `ProductCard` elements and a `Shop all` Link.
3. `<section id="about">` with the approved `The Situation` copy from the
   spec and optional `firstFeaturedImage` only when it exists.
4. `The Tee, Not the Drama` with approved copy and a Link to `firstFeaturedHref`.
5. `The Context, For Once` with the approved short transparency copy and a
   `See product details` Link to `/products`.
6. The final `No context? Perfect.` block and a second Link to `/products`.

When `catalog.status === "unavailable"`, place exactly this customer-safe text
near the hero CTA: `The shop is temporarily unavailable. Please try again soon.`
Do not show it for a successfully loaded empty array. Use `<img>` only after a
truthy image URL check, and give every product image the real product name as
its `alt`. Mark open-frame, squiggle and paper accents `aria-hidden="true"`.

- [ ] **Step 4: Replace only the public route shell in `src/app/page.tsx`**

Replace the current `Storefront`, `env`, shipping-country, technical notice,
and visible `Admin` shell with this route boundary:

```tsx
import { HomePageContent } from "@/components/home-page-content";
import { getPublicCatalog } from "@/lib/public-catalog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <HomePageContent catalog={await getPublicCatalog()} />;
}
```

Do not delete `src/components/storefront.tsx`; the checkout flow and the
existing language test still own that component independently.

- [ ] **Step 5: Run the focused home test and the existing public language test**

Run: `npx.cmd vitest run --environment node src/components/home-page-content.test.tsx src/app/customer-language.test.ts`

Expected: PASS. The old checkout-shell assertion remains valid because it
renders `Storefront` directly; the new home assertions prove the public route
does not reuse that shell.

- [ ] **Step 6: Check the task diff before moving on**

Run: `git diff --check -- src/components/home-page-content.tsx src/components/home-page-content.test.tsx src/app/page.tsx`

Expected: no output.

### Task 3: Make `/products` consume the shared result and state copy

**Files:**
- Modify: `src/app/products/page.tsx`
- Create: `src/app/products/page.test.tsx`

**Interfaces:**
- Consumes: `getPublicCatalog(): Promise<PublicCatalogResult>` from Task 1 and `ProductCard`.
- Produces: a listing that renders the real public catalog, an empty state, or an unavailable state without leaking implementation details.

- [ ] **Step 1: Write failing tests that mock the shared catalog boundary**

```tsx
vi.mock("@/lib/public-catalog", () => ({ getPublicCatalog: vi.fn() }));

it("renders all available catalog products", async () => {
  vi.mocked(getPublicCatalog).mockResolvedValue({ products: [product], status: "available" });
  const html = renderToStaticMarkup(await ProductsPage());
  expect(html).toContain(product.name);
  expect(html).toContain("The First Drop");
});

it("renders the approved empty state", async () => {
  vi.mocked(getPublicCatalog).mockResolvedValue({ products: [], status: "available" });
  expect(renderToStaticMarkup(await ProductsPage())).toContain(
    "Nothing here yet. Check back after the next questionable decision."
  );
});

it("renders the safe unavailable state", async () => {
  vi.mocked(getPublicCatalog).mockResolvedValue({ products: [], status: "unavailable" });
  const html = renderToStaticMarkup(await ProductsPage());
  expect(html).toContain("The shop is temporarily unavailable. Please try again soon.");
  expect(html).not.toContain("FIREBASE_PROJECT_ID");
});
```

- [ ] **Step 2: Run the products-page test and confirm it fails against the old Firestore dependency**

Run: `npx.cmd vitest run --environment node src/app/products/page.test.tsx`

Expected: FAIL because `ProductsPage` still imports and calls `listCatalogProducts()`.

- [ ] **Step 3: Switch the route to `getPublicCatalog` and add explicit states**

Use this control flow after the existing hero:

```tsx
const catalog = await getPublicCatalog();

if (catalog.status === "unavailable") {
  return <CatalogState kind="unavailable" />;
}

if (!catalog.products.length) {
  return <CatalogState kind="empty" />;
}

return <section className="ncc-products-grid" aria-label="Products">...</section>;
```

`CatalogState` may stay private to `src/app/products/page.tsx`; render it as a
`<section className="ncc-catalog-state" aria-live="polite">` with the exact
copy specified in `STOREFRONT_HOME_AND_PRODUCTS.md`. Keep one H1 in the hero,
keep `<SiteHeader />`, and map all available products through the existing
`<ProductCard key={product.id} product={product} />`.

- [ ] **Step 4: Run focused route tests**

Run: `npx.cmd vitest run --environment node src/app/products/page.test.tsx src/lib/public-catalog.test.ts`

Expected: PASS for available, empty, and unavailable catalog states.

- [ ] **Step 5: Check the task diff before moving on**

Run: `git diff --check -- src/app/products/page.tsx src/app/products/page.test.tsx`

Expected: no output.

### Task 4: Add the scoped visual system, regression coverage, and browser verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/customer-language.test.ts`

**Interfaces:**
- Consumes: `ncc-page` color tokens and the class names rendered by `HomePageContent` and the products-page `CatalogState`.
- Produces: responsive home/listing styles that preserve existing PDP class contracts.

- [ ] **Step 1: Add a failing customer-language assertion for the new page copy**

Add to `src/app/customer-language.test.ts` a server-rendered assertion using
`HomePageContent` with an available empty catalog and `ProductsPage` with the
mocked empty catalog. Require the approved English strings and reject the
existing `spanishCustomerCopy` regular expression.

```tsx
expect(homeHtml).toContain("Funny graphic tees for whatever that was.");
expect(productsHtml).toContain("Nothing here yet. Check back after the next questionable decision.");
expect(`${homeHtml}\n${productsHtml}`).not.toMatch(spanishCustomerCopy);
```

- [ ] **Step 2: Run the language test and confirm it fails until page-level copy is covered**

Run: `npx.cmd vitest run --environment node src/app/customer-language.test.ts`

Expected: FAIL until the new imports/mocks and assertions are correctly wired.

- [ ] **Step 3: Add only scoped `ncc-home-*` and catalog-state CSS**

Append the new home blocks beside the existing `ncc-products-*` styles in
`src/app/globals.css`. Use `--ncc-cream`, `--ncc-ink`, `--ncc-cobalt`,
`--ncc-tomato`, and `--ncc-raspberry`; do not replace global `:root` tokens or
PDP rules.

Implement these layout contracts:

```css
.ncc-home { overflow: clip; }
.ncc-home-hero { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr); }
.ncc-home-drop__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ncc-home-about, .ncc-home-proof, .ncc-home-context, .ncc-home-final { position: relative; }
.ncc-catalog-state { margin: clamp(28px, 5vw, 68px) auto 0; max-width: 42rem; text-align: center; }
```

Use the mockups as the visual hierarchy: warm paper ground, oversized black
condensed headlines, cobalt/tomato/raspberry accents, an open frame used once
per major visual moment, and editorial asymmetry. Keep product art legible;
never use it as a busy background behind a CTA.

At `max-width: 720px`, collapse the hero, product proof and final CTA to one
column; switch the three featured cards to one column with a sensible maximum
width; retain 44 px CTA height; and avoid negative horizontal margins that
create page overflow. Reuse `clamp()` for type rather than adding a second
desktop-only typography system.

- [ ] **Step 4: Run the full automated verification suite**

Run: `npm.cmd run lint; if ($LASTEXITCODE -eq 0) { npm.cmd test }; if ($LASTEXITCODE -eq 0) { npm.cmd run build }`

Expected: every command exits with code 0. Stop at the first failure and fix
the relevant task before continuing; do not weaken product, checkout, webhook,
or PDP tests to make the suite pass.

- [ ] **Step 5: Perform visual and keyboard smoke checks in a browser**

Run: `npm.cmd run dev`

Check `/` and `/products` at 1440 px, 768 px, 375 px, and 320 px wide with a
catalog that has real current assets when the local environment is configured.
Confirm all six home blocks appear in order, the first-drop cards retain their
real names/images/prices, `Shop all` and hero CTAs reach `/products`, and
`About` from `/products` lands at `#about`. Tab through the header and each
CTA: focus must be visible and no link is hidden behind decorative art. Repeat
the two routes with the catalog boundary mocked/unavailable to confirm the safe
message has no technical detail.

- [ ] **Step 6: Finish with a clean documentation and source diff check**

Run: `git diff --check; git status --short`

Expected: no whitespace errors. Report modified files and preserve unrelated
working-tree changes. Do not stage or commit without new user authorization.

## Plan self-review

### Spec coverage

- The six home sections, approved hero copy, `About` anchor, catalog-derived
  featured products, supplier-context boundary, and closing CTA are implemented
  in Task 2 and styled in Task 4.
- The `/products` listing, its genuine empty and unavailable states, and its
  existing card usage are covered in Task 3.
- Real catalog images/prices/slugs and the rule against mockup data are pinned
  by Tasks 1–3.
- Mobile, keyboard, no-overflow, English-first, and no-technical-copy checks
  are pinned in Task 4.
- Existing checkout/PDP behavior remains out of scope and is protected by the
  full test and build commands in Task 4.

### Placeholder scan

The plan defines the files, function names, public types, exact public copy,
test cases, commands, and safe fallback paths needed for implementation. It
contains no deferred implementation markers.

### Type consistency

`PublicCatalogResult` is produced by `getPublicCatalog`, received by
`HomePageContent`, and consumed directly by both route pages. Product links
use the existing `getProductSlug(product): string | undefined` contract and
images use the existing `getCatalogProductImage(product): string | undefined`
contract throughout.

### Review focus coverage

- Failed Firestore reads: Tasks 1, 2, and 3 test the unavailable result and
  customer-safe copy.
- Empty successful reads: Tasks 2 and 3 test no cards and the editorial empty
  state.
- Missing slugs: Task 2 tests the `/products` fallback destination.
- Missing images: Task 2 tests that undefined image URLs are not rendered.
- Narrow-screen anchor navigation: Task 4 requires the actual mobile browser
  smoke check for `/#about` and horizontal overflow.
