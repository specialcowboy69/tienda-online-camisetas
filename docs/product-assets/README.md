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
- Use Printful's centimeter values as the storefront default. Keep inches as
  source evidence or optional future display data.
- Do not infer fit, fabric composition, care, shipping or returns from these
  screenshots. Those require separate verified sources.
