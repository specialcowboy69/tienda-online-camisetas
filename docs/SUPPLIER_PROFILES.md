# Perfiles de proveedor y afirmaciones de producto

> Estado: fuente documental de las afirmaciones públicas de proveedor y de
> producción responsable. Última verificación: 2026-09-09.

Esta guía complementa la [guía de marca y storefront](BRAND_STOREFRONT.md).
Define qué puede mostrar la tienda para cada prenda y de qué fuente procede.
No reemplaza los datos de catálogo de Printful o Firestore.

## Reglas de publicación

- Mostrar el país de la **empresa proveedora**, no el país de fabricación de la
  prenda.
- Mostrar únicamente el perfil asignado al producto o variante vendida.
- El bloque público usa `Supplier`, `What applies` y `See the source ↗`.
- `See the source ↗` abre la fuente oficial del proveedor en otra pestaña.
- No usar afirmaciones generales como `eco-friendly`, `sustainable fashion`,
  `ethical fashion` o `zero impact`.
- No atribuir al estampado, fulfillment o envío una afirmación que solo aplique
  a la prenda base, al proceso de teñido o a las prácticas del proveedor.

## Mapa de productos facilitado

Los nombres e IDs siguientes proceden del inventario facilitado para esta guía.
Los nombres de tienda son etiquetas comerciales y pueden cambiar. La relación
estable se mantiene con el ID de Printful y el perfil de proveedor.

| Nombre de tienda actual | ID de Printful | Proveedor | Modelo | Perfil |
| --- | ---: | --- | --- | --- |
| Falling Apart | 468682936 | Comfort Colors | 1717, camiseta gruesa teñida unisex | `comfort-colors-1717` |
| Sorry I Can’t Triblend | 468520575 | BELLA+CANVAS | 3413, camiseta triblend unisex | `bella-canvas-production` |
| Farming Dog Aura | 468513582 | Comfort Colors | 1717, camiseta gruesa teñida unisex | `comfort-colors-1717` |
| It’s a Trap Crop Top | 468502976 | BELLA+CANVAS | 6882GD, Women’s Garment Dye Cropped Tee | `bella-canvas-production` |
| Momma Sorry Sweeter | 468471370 | BELLA+CANVAS | 7502, Women’s Cropped Fleece Hoodie | `bella-canvas-production` |

Antes de publicar o cambiar un producto, comprobar que el ID de Printful sigue
asignado al mismo proveedor y modelo. Si no coincide, no reutilizar el perfil.

## Perfil `comfort-colors-1717`

### Texto público

```text
SUPPLIER
Comfort Colors, by Gildan — Canadian apparel company

WHAT APPLIES
Comfort Colors’ Pigment Pure™ dyeing process uses, on average, 3× less water,
40% less process time, less energy, and zero salt compared with conventional
reactive dyeing.*

SEE THE SOURCE ↗
```

**Nota visible:** `* Applies to the garment’s dyeing process. Supplier-reported comparison.`

### Alcance y fuentes

- El proveedor incluye el estilo G1717 en su página de sostenibilidad y atribuye
  las cifras al proceso de teñido Pigment Pure™ frente al teñido reactivo
  convencional. No son una medición de la impresión, el packaging, el
  fulfillment o el envío de la tienda.
- Gildan, empresa matriz de Comfort Colors, declara participación/acreditación
  con Fair Labor Association y certificación WRAP para sus instalaciones de
  confección. Es información de prácticas del proveedor, no una certificación
  individual emitida para cada camiseta vendida por No Context Club.
- `See the source ↗`: [Comfort Colors sustainability](https://retail.comfortcolors.com/sustainability)
- Evidencia complementaria: [Gildan recognitions and partnerships](https://gildancorp.com/en/responsibility/recognitions-and-partnerships/)

## Perfil `bella-canvas-production`

### Texto público

```text
SUPPLIER
BELLA+CANVAS — U.S.-based apparel company

WHAT APPLIES
BELLA+CANVAS reports WRAP-certified facilities and Fair Labor Accreditation,
alongside water-reduction practices, treated wastewater, and bluesign®-approved
inputs at its primary dye house.*

SEE THE SOURCE ↗
```

**Nota visible:** `* These are supplier and supply-chain practices, not a style-specific impact measurement.`

### Alcance y fuentes

- Este perfil se aplica a los estilos 3413, 6882GD y 7502 por sus prácticas de
  proveedor publicadas. No comunica una reducción de agua, emisiones o impacto
  cuantificada para uno de esos modelos concretos.
- BELLA+CANVAS declara que sus instalaciones tienen certificación WRAP y que
  obtiene sus productos de fábricas certificadas WRAP; también declara Fair
  Labor Accreditation. Para sus operaciones informa de tratamiento de aguas
  residuales y de tintes, químicos y suavizantes aprobados por bluesign® en su
  tintorería principal.
- `See the source ↗`: [BELLA+CANVAS commitment](https://www.bellacanvas.com/our-commitment)
- Evidencia complementaria: [BELLA+CANVAS eco-friendly practices](https://www.bellacanvas.com/eco_friendly)

## Mantenimiento

1. Confirmar proveedor y modelo contra el catálogo actual de Printful.
2. Revisar los enlaces y el contenido de sus fuentes oficiales al menos una vez
   al año o antes de una campaña que destaque estas afirmaciones.
3. Actualizar `Última verificación`, alcance y copy cuando una fuente cambie.
4. Si un producto utiliza un proveedor sin perfil aprobado, ocultar el bloque
   de proveedor hasta documentarlo.
