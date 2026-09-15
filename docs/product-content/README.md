# Contenido de producto

Esta carpeta es la fuente editorial de cada página de producto. Conserva el
texto original facilitado desde Printful y el copy adaptado y verificado para
No Context Club, sin depender del nombre comercial editable.

No es una fuente de datos de ejecución: cuando el PDP se implemente, el copy
con estado `Verified` se trasladará al dato de producto de Firestore o al
sistema de contenido que lo sustituya.

## Uso

Cada archivo se nombra con el ID estable de Printful. Debe contener:

1. El texto original de Printful, sin usarlo directamente en la tienda.
2. El copy de storefront en inglés: descripción, `FIT & FEEL` y
   especificaciones.
3. Notas de publicación, incluyendo cualquier condición aplicable por color.

No introducir en el copy público frases genéricas de Printful sobre
personalización o vender online. Tampoco mostrar país de fabricación ni ampliar
una especificación más allá de la ficha de la prenda concreta.

## Índice actual

| ID de Printful | Nombre actual | Estado | Archivo |
| ---: | --- | --- | --- |
| 468682936 | Falling Apart | Verified; modelo 1717 compartido | [468682936](468682936.md) |
| 468520575 | Sorry I Can’t Triblend | Verified | [468520575](468520575.md) |
| 468513582 | Farming Dog Aura | Verified | [468513582](468513582.md) |
| 468502976 | It’s a Trap Crop Top | Verified | [468502976](468502976.md) |
| 468471370 | Momma Sorry Sweeter | Verified | [468471370](468471370.md) |

El ID, proveedor y modelo de prenda se confirman en
[perfiles de proveedor](../SUPPLIER_PROFILES.md). La guía de talla se mantiene
por ID en [assets de producto](../product-assets/README.md).

## Uso de `FIT & FEEL` en la guía de talla

Los tres atributos de `FIT & FEEL` de cada ficha alimentan el bloque de ayuda
de talla del PDP. Explican el corte y la sensación de la prenda, pero no son una
regla de `size up` o `size down`. La tabla y el método de medición se mantienen
en [assets de producto](../product-assets/README.md) y se resuelven por ID de
Printful.

## Revisión futura

La propietaria confirmó las descripciones y composiciones actuales el
2026-09-10. Revisar de nuevo el producto y variante de Printful solo si cambia
la prenda base, el catálogo o la ficha del proveedor. Registrar la fecha de esa
revisión en el archivo afectado.
