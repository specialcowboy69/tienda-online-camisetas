# Implementación de home y listado de productos — No Context Club

## Propósito y alcance

Este documento es el contrato de implementación para la home (`/`) y el
listado de productos (`/products`) de **No Context Club**. Convierte la
dirección creativa aprobada en requisitos de interfaz y datos que se pueden
construir y verificar. No confirma que esta interfaz esté ya implementada.

La home debe descubrir la marca, mostrar el drop y llevar a la ficha de un
producto real. `/products` debe permitir comparar y elegir el catálogo real.
No son dos checkout distintos, ni deben modificar el PDP, el carrito, Stripe,
Printful, Firestore o las políticas existentes.

### Orden de lectura para quien implemente

1. [Guía de marca y storefront](BRAND_STOREFRONT.md): fuente de verdad para
   tono, copy aprobado, restricciones de catálogo y uso de assets.
2. Este documento: arquitectura, contenido y criterios de aceptación para las
   dos rutas.
3. Archivo creativo local:
   `C:\Users\USUARIO\Downloads\experto-diseño-web\docs\no-context-club\README.md`.
   Contiene la dirección visual y los seis mockups de home.
4. Referencias visuales locales:
   `C:\Users\USUARIO\Downloads\experto-diseño-web\mockups\no-context-club-home\section-01-hero.png`
   hasta `section-06-closing-cta.png`.

Los PNG del proyecto de diseño son referencias de composición, jerarquía,
tipografía y energía. No se deben servir como imágenes de producto ni copiar a
`public/`: contienen ilustraciones de presentación y datos que no sustituyen
los assets comerciales reales.

## Principios no negociables

- La interfaz pública y cualquier estado visible al cliente son **English-first**.
- Firestore y Printful siguen siendo la fuente de verdad para producto activo,
  variantes, precio, moneda, disponibilidad e imágenes.
- Las tarjetas y los bloques de producto deben usar los helpers y datos
  actuales de catálogo; no se codifican imágenes de producto, precios,
  variantes, stock, testimonios ni urgencia del mockup. El hero y el cierre
  usan los assets editoriales independientes de Cloudflare R2 aprobados.
- En el catálogo inicial de cinco productos no habrá filtros, categorías,
  colecciones de relleno, `Best Sellers`, descuentos ni ratings inventados.
- Una tarjeta solo enlaza a un PDP cuando `getProductSlug(product)` devuelve
  una ruta pública. Si no existe slug, su destino seguro es `/products`.
- Los fallos de lectura del catálogo nunca muestran errores de Firebase,
  variables de entorno, detalles de sincronización ni enlaces de administración
  a un comprador.
- El enlace `About` de la cabecera debe llegar a un elemento real con
  `id="about"` en la home.
- No cambiar los componentes de PDP, el cálculo de envío, Stripe, Printful,
  las APIs públicas ni el modelo de Firestore para esta iteración.
- Los claims de proveedor y sostenibilidad detallados, sus fuentes externas y
  sus notas legales permanecen en el PDP. La home solo presenta el principio
  editorial breve y enlaza a productos reales.

## Datos y componentes que ya existen

| Elemento | Uso en la implementación |
| --- | --- |
| `listCatalogProducts()` | Carga los productos públicos y excluye `isIgnored`. |
| `CatalogProduct` | Contrato para nombre, imágenes, variantes, precio y estado. |
| `getCatalogProductImage(product)` | Resuelve portada manual, galería manual o fallback de Printful. |
| `getProductSlug(product)` | Protege los enlaces a fichas de producto publicadas. |
| `ProductCard` | Tarjeta de producto reutilizable con imagen, nombre, precio activo y CTA. |
| `SiteHeader` | Wordmark y navegación compartida de No Context Club. |
| `globals.css` y las clases `ncc-*` | Tokens de paleta y el sistema visual existente de PDP/listado. |

No duplicar la lógica de precio, imagen o slug dentro de las páginas. Si hace
falta seleccionar productos destacados o normalizar el estado de error de
catálogo, crear un helper pequeño y probado en `src/lib/`.

## Arquitectura de páginas

### `/` — Home de descubrimiento

`src/app/page.tsx` deja de mostrar la antigua pantalla técnica con checkout y
administración. Continúa siendo una ruta de servidor dinámica, carga el
catálogo mediante un límite de error seguro y delega el render editorial a un
componente de home que recibe `CatalogProduct[]` y el estado de disponibilidad.

La home debe seguir este orden. Los nombres son contratos de contenido y las
clases pueden reflejarlos con el prefijo `ncc-home-*`.

#### 1. Hero — la promesa

- Eyebrow: `NO CONTEXT CLUB`.
- H1: `Funny graphic tees for whatever that was.`
- Apoyo: `Graphic apparel for pet drama, coffee disasters, questionable choices, and every other story that gets worse with context.`
- CTA principal: `SHOP THE FIRST DROP`, destino `/products`.
- Visual: composición de papel cálido, tipografía condensada, marco abierto
  aislado y el asset editorial aprobado `no-context-club-home-hero.webp`,
  alojado en Cloudflare R2 e independiente de la disponibilidad del catálogo.

#### 2. The First Drop — selección editable desde el catálogo

- Kicker: `THE FIRST DROP`.
- Título: `Small drop. Big energy.`
- Descripción: `Five designs. Zero need to explain them.`
- Mostrar hasta tres productos públicos con slug, en el orden ya entregado por
  catálogo. Usar `ProductCard` con CTA `VIEW PRODUCT`; no copiar precios,
  nombres ni fotos en JSX.
- CTA de salida: `SHOP ALL`, destino `/products`.
- Si no hay productos, ocultar las tarjetas y conservar una llamada editorial
  honesta hacia `/products`, sin prometer disponibilidad futura ni inventar
  producto.

#### 3. About / The Situation — la voz de marca

El contenedor usa `id="about"` para que funcione la navegación existente.

- Kicker: `THE SITUATION`.
- Título: `No context. Better stories.`
- Copy: `For people who somehow became the main character in a group chat about a cat, a coffee, or both.`
- Cierre: `Wear the part you can explain. Or don't.`
- La composición puede dar protagonismo editorial a una imagen real del primer
  producto destacado, pero la sección sigue funcionando solo con texto si esa
  imagen no existe.

#### 4. Product proof — el objeto que se compra

- Kicker: `THE TEE, NOT THE DRAMA`.
- Título: `The art gets the attention. The tee has to earn the repeat wear.`
- CTA: `SEE THE DETAILS`, destino al PDP del primer producto destacado si ese
  producto conserva slug; en cualquier otro caso, `/products`.
- La imagen debe proceder del catálogo real. Si no hay una imagen útil, usar el
  bloque tipográfico y los acentos de marca; no generar ni publicar un asset
  ficticio para completar el hueco.
- No añadir composición, peso, fit, proveedor, precio o claim de calidad en
  este bloque: esa información varía por producto y ya vive en el PDP.

#### 5. The Context, For Once — transparencia sin greenwashing

- Kicker: `THE CONTEXT, FOR ONCE`.
- Título: `No context for the joke. Full context for the tee.`
- Copy: `The details behind every garment belong with the product, not in fine print.`
- CTA: `SEE PRODUCT DETAILS`, destino `/products`.
- No incluir URLs de proveedor, países, modelos base, símbolos de certificación
  ni una afirmación general de que toda la marca es sostenible. Es una puerta
  hacia el contexto verificado de cada PDP.

#### 6. Cierre

- Título: `No context? Perfect.`
- Apoyo: `The drop is waiting. The explanation isn't.`
- CTA: `SHOP THE FIRST DROP`, destino `/products`.
- Usa el asset editorial aprobado `no-context-club-home-final-cta.webp`,
  alojado en Cloudflare R2 e independiente de la disponibilidad del catálogo.

### `/products` — elegir y comparar el drop

La página ya usa `SiteHeader`, `ProductCard` y la cuadrícula `ncc-*`. Mantener
esa base y alinear el contenido con la home:

- Eyebrow: `THE FIRST DROP`.
- H1: `Graphic apparel for whatever that was.`
- Apoyo: `Pet drama, coffee disasters, questionable choices and every other story that gets worse with context.`
- Renderizar todos los productos públicos devueltos por Firestore, sin
  filtros, categorías, orden manual, etiquetas SEO visibles ni colección falsa.
- Cada tarjeta conserva imagen, nombre, precio calculado sobre variantes
  activas y CTA. `ProductCard` mantiene el fallback seguro a `/products` para
  un producto sin slug.
- Con catálogo disponible pero vacío, mostrar un estado editorial en inglés:
  `Nothing here yet. Check back after the next questionable decision.`
- Si falla la carga de catálogo, mostrar un estado distinto y seguro:
  `The shop is temporarily unavailable. Please try again soon.` No se muestra
  el mensaje original del error ni instrucciones administrativas.

## Assets de fotografía y contenido

1. La portada comercial de cada producto se guarda y sincroniza como asset de
   catálogo (`storefrontImage` o `storefrontImages`); esa es la única fuente
   para tarjetas y bloques de producto en estas rutas.
2. Hero y cierre usan los dos assets editoriales independientes aprobados de
   Cloudflare R2; no sustituyen imágenes ni datos del catálogo. Las imágenes
   de proof, situation y demás bloques de producto deben representar la prenda
   real, el color y el diseño vendible. Sin imagen útil, el bloque queda
   tipográfico.
3. Escribir `alt` útil mediante el nombre real de producto en sus imágenes y
   una descripción de la escena en los assets editoriales. Los elementos de
   acento puramente decorativos usan `aria-hidden="true"`.
4. No subir los mockups de referencia a producción. Los assets finales deben
   tener derechos comerciales confirmados y una versión web optimizada antes
   de publicarse en la web.

## Responsive, accesibilidad y comportamiento

- Una única H1 por ruta; los títulos de sección serán H2 en orden lógico.
- Todos los CTAs serán enlaces cuando naveguen a otra ruta o ancla; no usar
  botones para navegación.
- Mantener objetivo táctil de al menos 44 px para acciones principales y foco
  visible con teclado.
- A 320 px, 375 px, tablet y escritorio no debe existir overflow horizontal,
  texto recortado, CTA inaccesible ni imagen que tape el nombre de producto.
- El menú de cabecera conserva enlaces a `/products` y `/#about`; el ancla
  debe caer en la sección correcta también desde `/products`.
- Las tarjetas y todos los bloques sin imagen deben mantener lectura útil y
  jerarquía visual; la ausencia de asset no debe provocar un cuadro roto.

## Definition of done

La iteración está lista para revisión cuando se cumplan simultáneamente estos
criterios:

1. `/` muestra las seis secciones en el orden definido, con el hero aprobado,
   el ancla `about` real y CTAs que llegan a rutas existentes.
2. `/products` muestra el drop público real sin filtros ni datos comerciales
   falsos, y presenta estados distintos para vacío y error de catálogo.
3. Precios, imágenes de producto, nombres y enlaces a PDP proceden de los
   helpers y datos existentes; hero y cierre usan los assets editoriales de R2
   aprobados. Los mockups de referencia no se sirven como assets.
4. Los productos sin slug no generan URL de PDP inexistente.
5. El antiguo enlace visible a `Admin`, mensajes técnicos de Firebase y el
   checkout integrado no aparecen en la home pública.
6. El PDP, carrito, checkout, Printful y Stripe siguen pasando sus pruebas
   existentes sin cambios funcionales.
7. `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run build` y una comprobación
   visual de escritorio/móvil concluyen correctamente antes de solicitar
   revisión.

## Fuera de alcance de esta iteración

- Implementar categorías, filtros, búsqueda, favoritos, reseñas o colección
  `Best Sellers`.
- Inventar claims de sostenibilidad, confianza, entrega o devolución para la
  home.
- Migrar imágenes de mockups o generar fotografías nuevas dentro del código.
- Reescribir las fichas de producto ya terminadas.
- Alterar catálogo, precio, stock, variantes, checkout o datos de proveedor.
