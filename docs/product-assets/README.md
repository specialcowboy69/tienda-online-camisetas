# Product assets and size guides

This folder stores product-related source assets that support the storefront.
Only add assets that are useful to the website or to verifying website data.

## Size guides

The public size guide must be selected from the product's stable Printful /
Firestore ID, not from the editable product name.

Flow:

```text
Printful product ID -> base garment -> size guide
```

Source screenshots are stored in:

```text
docs/product-assets/size-guides/
```

Structured storefront data is stored in:

```text
src/lib/size-guides.ts
```

Regression coverage is in:

```text
src/lib/size-guides.test.ts
```

Current product mapping:

| Printful ID | Product name at time of mapping | Base garment guide |
| ---: | --- | --- |
| 468682936 | Falling apart | `comfort-colors-1717-heavyweight-unisex` |
| 468513582 | Farming dog aura | `comfort-colors-1717-heavyweight-unisex` |
| 468520575 | Sorry i cant triblend | `bella-canvas-3413-triblend-unisex` |
| 468502976 | Its a trap crop top | `bella-canvas-6882gd-womens-cropped-tee` |
| 468471370 | Momma sorry sweeter | `bella-canvas-7502-womens-cropped-hoodie` |

Current guide assets:

| Guide | Centimeters source | Inches source |
| --- | --- | --- |
| `comfort-colors-1717-heavyweight-unisex` | `size-guides/comfort-colors-1717-heavyweight-unisex-cm.png` | `size-guides/comfort-colors-1717-heavyweight-unisex-inches.png` |
| `bella-canvas-3413-triblend-unisex` | `size-guides/bella-canvas-3413-triblend-unisex-cm.png` | `size-guides/bella-canvas-3413-triblend-unisex-inches.png` |
| `bella-canvas-7502-womens-cropped-hoodie` | `size-guides/bella-canvas-7502-womens-cropped-hoodie-cm.png` | `size-guides/bella-canvas-7502-womens-cropped-hoodie-inches.png` |
| `bella-canvas-6882gd-womens-cropped-tee` | `size-guides/bella-canvas-6882gd-womens-cropped-tee-cm.png` | `size-guides/bella-canvas-6882gd-womens-cropped-tee-inches.png` |

Rules:

- Changing a product name in Printful should not change its size guide.
- Deleting and recreating a Printful product can change the product ID; update
  this mapping and `src/lib/size-guides.ts` if that happens.
- Changing the base garment requires a new or existing matching size guide.
- For the US storefront, show Printful's inch values by default and offer
  centimeters as an optional unit toggle. Keep both source assets available.
- Do not infer fit, fabric composition, care, shipping or returns from these
  screenshots. Those require separate verified sources.

## PDP sizing flow

The size experience is a product-specific local modal, not a link to Printful.
Resolve its content through the stable Printful / Firestore ID and the mapping
above.

1. `SIZE GUIDE` opens the modal on `PRODUCT MEASUREMENTS`.
2. The first tab shows the matching size table, using inches for the US
   storefront and a `CM` toggle. Include only the dimensions supplied by that
   garment guide and its published tolerance note.
3. `HOW TO MEASURE` is the second tab in the same modal. It shows a garment
   laid flat and labels `A Length`, `B Width`, and `C Sleeve length` only when
   that guide provides the measurement.
4. The PDP may show `NEED HELP WITH SIZE?` as a quiet text link below the main
   CTA. It opens the product's verified `FIT & FEEL` notes and, only as a last
   step, a contact route with the product prefilled.

Do not use a generic guide for every product, send shoppers to the Printful
dashboard, or make a `size up` / `size down` recommendation without actual fit
evidence. The product-specific fit attributes live in
[`docs/product-content/`](../product-content/README.md).
