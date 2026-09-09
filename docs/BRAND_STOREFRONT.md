# Guía de marca y storefront: No Context Club

## Estado y alcance

Esta guía define la dirección de marca y experiencia de compra que debe seguir
el storefront. Es una referencia para diseño, copy, datos de catálogo y futuras
iteraciones de interfaz; no confirma todavía qué partes están implementadas.

La marca es **No Context Club**. **Funny Tees 4 All** es el dominio y un
descriptor orientado a búsqueda, no el nombre que debe dominar la identidad
visual.

La guía no sustituye las fuentes de verdad operativas:

- Printful y Firestore: productos activos, variantes, precio, moneda, stock e
  imágenes disponibles.
- Políticas comerciales y legales: envíos, devoluciones, composición, cuidado,
  privacidad y condiciones.
- Este documento: tono, jerarquía de contenido y criterios visuales.

No publicar ni codificar como hechos datos de los mockups, incluidos precio,
plazos, materiales, fit o devoluciones, hasta verificarlos con la fuente
correspondiente.

## Público y personalidad

- Público principal: mujeres de Estados Unidos de 25 a 35 años, sin limitar la
  marca a ese grupo ni a una sola temática.
- Producto: camisetas y, a futuro, otras prendas gráficas con frases absurdas.
- Tono: seco, absurdo, satírico e internet-native; como un meme inteligente,
  nunca una broma infantil.
- Temas recurrentes: animales, café, trabajo, decisiones cuestionables y
  microdramas cotidianos. Los animales son una colección potente, no el límite
  de la marca.

La estética buscada es **comic editorial caótico y luminoso**: divertida y
adulta, con energía gráfica controlada. Evitar que derive a una tienda solo de
mascotas, gótico/true crime, kawaii infantil o streetwear agresivo.

## Sistema visual

| Uso | Color |
| --- | --- |
| Base cálida | Buttercream `#FFF3DF` |
| Texto y contornos | Ink `#171717` |
| Acento frío | Cobalt `#2859E7` |
| Acento cálido | Tomato `#F04E38` |
| Acento secundario | Raspberry `#D95282` |

- El wordmark `NO CONTEXT CLUB` debe ser contundente y condensado, normalmente
  en tinta.
- El marco abierto/incompleto es un recurso distintivo que comunica “falta
  contexto”. Usarlo con intención, no como decoración en cada bloque.
- La UI prioriza legibilidad y compra; la mayor expresividad visual vive en el
  arte de las prendas, titulares y acentos.
- Evitar fondos blancos genéricos de marketplace cuando un escenario editorial
  controlado ayude a presentar la prenda con más personalidad.

## Copy de home aprobado

**Titular**

> Funny graphic tees for whatever that was.

**Texto de apoyo**

> Graphic apparel for pet drama, coffee disasters, questionable choices, and every other story that gets worse with context.

**CTAs previstos**

- Principal: `Shop New In`
- Secundario: `See Best Sellers`

El segundo CTA solo se muestra cuando exista una base real para llamarla “best
sellers”. Mientras el catálogo sea muy pequeño, se puede sustituir por `Shop
All` o `The First Drop`.

## Navegación y catálogo inicial

Con un catálogo pequeño no crear colecciones o categorías visibles de relleno.
La navegación inicial debe priorizar:

- `Shop All` o `The First Drop`
- `About`
- Bolsa/carrito

Preparar el catálogo para crecer sin forzar páginas de categoría todavía:

- un único tipo de producto por artículo (`T-shirt`, `Hoodie`, etc.);
- etiquetas atómicas y reutilizables como `cat`, `dog`, `coffee`, `work`,
  `animal-humor` o `graphic-tee`;
- no usar una frase SEO completa, como `funny cat t-shirt`, como tag interno.

No exponer filtros ni colecciones hasta que haya suficientes productos con una
intención común. Como regla inicial, esperar al menos cuatro productos que
formen un grupo claro.

## Fotos de producto

Cada producto debe contar una microhistoria, pero su diseño gráfico debe verse
sin esfuerzo. Orden recomendado para la galería:

1. **Portada editorial:** modelo y camiseta plenamente legibles en un escenario
   sencillo de la paleta de marca. Es la imagen de grid y primera del PDP.
2. **Fit limpio:** modelo de frente o tres cuartos y fondo tranquilo. Cabello,
   brazos y pliegues no pueden tapar el arte. No es obligatorio aislar la
   camiseta sin modelo.
3. **Detalle:** impresión, cuello, tejido o caída real de la prenda.
4. **Escena narrativa:** una situación con más contexto y personalidad para
   home, editorial o redes.

Validar las portadas en móvil: si el diseño no se entiende en una tarjeta de
producto sin zoom, no sirve como primera imagen.

## Página de producto

El PDP tiene que vender la broma y resolver la compra. La estructura esperada
es:

1. Galería y bloque de compra: nombre, precio real, color, talla, CTA y señales
   de confianza confirmadas.
2. Fit y guía de tallas.
3. Historia del diseño o el contexto del chiste.
4. Detalles útiles: composición, cuidado, fabricación, envío y devoluciones
   verificadas.
5. Productos relacionados o bloque `The First Drop`.
6. CTA final.

Los mockups creados en el proyecto de diseño son referencias de jerarquía y
dirección visual. No son pantallas ya implementadas y contienen datos de ejemplo
que no deben reutilizarse sin comprobación.

## Flujo de trabajo de assets

El archivo creativo, brandboard, prompts y variaciones aprobadas viven en el
proyecto de diseño. Solo incorporar a este repositorio los assets finales que
vaya a servir la web, en la ubicación de producción elegida.

Antes de incorporar un asset, confirmar:

- que su uso comercial y sus derechos están resueltos;
- que representa correctamente la prenda, el diseño, color y fit vendidos;
- que se dispone de una versión optimizada para web y texto alternativo útil;
- que sus dimensiones responden a la tarjeta de producto y al PDP.

## Pendiente antes de producción

- Confirmar disponibilidad legal de la marca `No Context Club` para la clase y
  mercados relevantes.
- Validar el catálogo, precio, moneda, tallas, variantes y specs reales de
  Printful antes de adaptar la interfaz.
- Definir y revisar legalmente las páginas de privacidad, contacto, condiciones
  y devoluciones.
- Revisar todo copy visible y los emails para que compartan el tono de marca sin
  comprometer claridad en compra, soporte o incidencias.
