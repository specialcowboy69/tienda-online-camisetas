# Matriz interna de fulfillment y fiscalidad — No Context Club

Snapshot inicial: **2026-09-29**; ampliacion de cotizaciones y cierre de despliegue:
**2026-10-11**. Cada observacion conserva su propia fecha. Documento interno para revisar las
plantillas y el lanzamiento; no es una promesa de fabrica, origen, ruta,
stock futuro ni tratamiento fiscal para el cliente.

El alcance de destino previsto es Estados Unidos (`US`), Espana (`ES`),
Francia (`FR`), Alemania (`DE`), Italia (`IT`) y Portugal (`PT`). La apertura
efectiva sigue pendiente de la checklist de lanzamiento y de la revision
fiscal y legal. **Estado: NO-GO para pagos reales.**

## Snapshot del catalogo y sus limites

La consulta de variantes facilitada para esta revision corresponde a la
tecnica frontal `front_dtf` / `dtfilm` (impresion DTF). Estas etiquetas no
demuestran la fabrica asignada ni el origen aduanero de la prenda. La tabla
resume disponibilidad regional observada el 29 de septiembre de 2026, no
pedidos aceptados ni rutas de entrega verificadas.

| Producto | Prenda base | Disponibilidad regional en la consulta | Revision pendiente para la UE |
| --- | --- | --- | --- |
| Falling Apart | Comfort Colors 1717 | Casi todas las variantes EU/US; True Navy M y L sin stock EU en esta consulta | Reconsultar variante exacta y ruta; esas tallas pueden exigir espera, otra ruta o restriccion |
| Farming Dog Aura | Comfort Colors 1717 | Casi todas las variantes EU/US; True Navy M y L sin stock EU en esta consulta | Reconsultar variante exacta y ruta; esas tallas pueden exigir espera, otra ruta o restriccion |
| Sorry I Can't Triblend | Bella+Canvas 3413 | 15 de 30 variantes con disponibilidad EU; no hay cobertura EU completa | Identificar por color/talla las 15 variantes y confirmar la ruta de las restantes antes de ofrecerlas |
| It's a Trap Crop Top | Bella+Canvas 6882GD | US-only en esta consulta | Confirmar importacion desde fuera de la UE, costes y responsable antes de habilitar venta UE |
| Momma Sorry Sweeter | Bella+Canvas 7502 | S–XL EU/US; 2XL US-only en esta consulta | Confirmar ruta EU para S–XL y revisar por separado importacion/costes de 2XL |

La disponibilidad regional indicada como Letonia, Europa o Estados Unidos
para un destino UE no demuestra la fabrica concreta ni la ruta final. Una
region disponible tampoco equivale a stock utilizable en todas las tallas,
colores o tecnicas. Hay que volver a consultar el catalogo y la variante al
preparar cada pedido, especialmente ante cambios de stock.

La evidencia detallada de IDs, color/talla, respuesta de disponibilidad y
hora de consulta debe conservarse o renovarse antes de tomar decisiones por
variante. Este documento no incorpora esa respuesta completa y las fuentes
publicas de abajo no prueban el stock de los productos concretos de la tabla.

## Routing y comunicacion al cliente

Printful selecciona automaticamente el centro segun direccion de entrega,
stock, disponibilidad de la tecnica y capacidad. El centro mas cercano es una
posibilidad habitual, pero puede cambiar. La configuracion de instalaciones
de respaldo tambien debe revisarse. No es posible elegir manualmente un
centro para cada pedido segun la documentacion de
[routing de Printful](https://help.printful.com/hc/en-us/articles/50265294440209-Can-I-choose-where-my-products-are-fulfilled).

La [lista oficial de centros](https://help.printful.com/hc/en-us/articles/50265275089041-Where-are-the-Printful-fulfillment-centers-located)
incluye Riga/Letonia y Barcelona/Espana, ademas de centros en Norteamerica y
Reino Unido. La existencia de un centro no asigna estos productos a ese
centro. Reino Unido tampoco equivale a la UE. El pais de confeccion de la
prenda base, el de impresion, el de expedicion y el origen aduanero pueden ser
distintos; ninguno se deduce de una etiqueta EU/US.

Las plantillas publicas deben explicar produccion bajo pedido y plazos
estimados sin prometer "hecho en Espana", una fabrica fija ni ausencia de
importacion. La [informacion de envio de Printful](https://www.printful.com/shipping)
avisa de posibles cargos cuando un paquete sale de otra region. Deben
confirmarse los plazos y costes de la ruta concreta antes del lanzamiento.

## Destinos, IVA y aduanas pendientes

| Destino | Posibilidad regional del snapshot | Estado de ruta, importador y cargos |
| --- | --- | --- |
| US — Estados Unidos | US disponible en las prendas consultadas; routing dinamico | Pendiente por pedido; verificar expedicion, impuestos y condiciones del transportista |
| ES — Espana | Letonia/Europa/US segun variante y stock | Pendiente por pedido; confirmar IVA, OSS/IOSS si procede e importacion; DDP UE no garantizado |
| FR — Francia | Letonia/Europa/US segun variante y stock | Pendiente por pedido; confirmar IVA, OSS/IOSS si procede e importacion; DDP UE no garantizado |
| DE — Alemania | Letonia/Europa/US segun variante y stock | Pendiente por pedido; confirmar IVA, OSS/IOSS si procede e importacion; DDP UE no garantizado |
| IT — Italia | Letonia/Europa/US segun variante y stock | Pendiente por pedido; confirmar IVA, OSS/IOSS si procede e importacion; DDP UE no garantizado |
| PT — Portugal | Letonia/Europa/US segun variante y stock | Pendiente por pedido; confirmar IVA, OSS/IOSS si procede e importacion; DDP UE no garantizado |

Printful describe el [DDP](https://help.printful.com/hc/en-us/articles/50265097613329-What-is-the-Delivered-Duty-Paid-DDP-shipping-option)
para determinadas opciones de Canada/Reino Unido y como predeterminado en
pedidos internacionales a US. Esa informacion no garantiza DDP para los
destinos UE de esta tienda. Su [pagina de aduanas](https://help.printful.com/hc/en-us/articles/50264522088209-Who-pays-the-customs-duties-taxes)
advierte de cargos posibles al destinatario. Hay que acordar y comunicar
responsabilidades y costes conforme a la ruta y normativa aplicable; no basta
con copiar la politica del proveedor.

El [IVA de los pedidos dirigidos a la UE en Printful](https://help.printful.com/hc/en-us/articles/50264510208273-How-is-VAT-applied-to-my-EU-bound-orders)
depende de fulfillment, destino y registro de IVA. El IVA facturado por
Printful al vendedor no resuelve por si solo el IVA de la venta del vendedor
al consumidor: son operaciones distintas. La [Comision Europea sobre OSS/IOSS](https://vat-one-stop-shop.ec.europa.eu/index_en)
explica los regimenes de ventas intracomunitarias e importaciones; debe
confirmarse cual corresponde a la estructura real de la tienda y a cada ruta.

Las [directrices aduaneras de la Comision Europea publicadas el 16 de junio de 2026](https://vat-one-stop-shop.ec.europa.eu/eur-3-customs-duty-vat-guidelines-2026-06-16_en)
describen cambios para importaciones de bajo valor desde el 1 de julio de
2026. No utilizar antiguas exenciones ni un importe fijo como garantia
comercial: el arancel, IVA y cualquier cargo de gestion aplicable deben
validarse en la fecha del pedido con la persona profesional y el transportista.

## Verificaciones antes de habilitar ventas

- [ ] Confirmar los destinos `US`, `ES`, `FR`, `DE`, `IT`, `PT` y su cobertura
  geografica con `ALLOWED_SHIPPING_COUNTRIES` y el checkout.
- [ ] Renovar el snapshot por variante, tecnica y region; comprobar los casos
  True Navy M/L, 3413 sin EU, 6882GD y 7502 2XL.
- [ ] Confirmar preferencias de instalaciones de respaldo y tratar cambios de
  ruta o stock sin promesas de fabrica fija.
- [ ] Documentar por pedido/paquete pais de expedicion, ruta, importador,
  transportista y tratamiento de cargos de importacion, incluidos los envios
  divididos entre centros.
- [ ] Validar IVA, OSS/IOSS y aduanas con una persona profesional para la
  compra al proveedor y para la venta al consumidor.
- [ ] Confirmar precios, costes, plazos estimados e informacion al cliente en
  PDP, checkout, politicas y emails.
- [ ] Mantener `STRIPE_TAX_ENABLED=false` y Stripe en modo test hasta cerrar
  fiscalidad y el resto de condiciones NO-GO.

Fuentes oficiales consultadas el **2026-09-29**. Las paginas y las reglas del
proveedor pueden cambiar; volver a comprobarlas antes del lanzamiento y ante
una ruta nueva. Este snapshot no acredita un pedido real, DDP UE, importador
designado, alta OSS/IOSS, ni aprobacion fiscal o legal.

## Comprobacion dinamica 2026-10-11

Actualizacion de evidencia, sin reemplazar el snapshot historico anterior.
Se leyeron los cinco productos activos de Firestore y sus metadatos sincronizados
en Printful: 130 variantes con IDs coincidentes y archivo imprimible
`front_dtf` (preview excluido). La consulta v2 admite placement `front_dtf` +
tecnica `dtfilm`; la propuesta inicial `front` + `dtfilm` devuelve 400.
No se sustituyo la tecnica por DTG ni se modifico el catalogo.
Contrato: [Shipping Rates v2](https://developers.printful.com/docs/v2-preview/#tag/Shipping-Rates-v2).

Cotizaciones con direcciones de prueba completas, una unidad por variante,
moneda USD. Solo lecturas y cotizaciones: sin pedidos, escrituras Firestore,
pagos, emails ni confirmacion de fabricacion. Los siguientes importes son
transporte, no precio del producto; el Standard ya esta integrado en el precio
comercial y no se vuelve a cobrar al cliente.

| Destino | Variante(s) de catalogo | Metodo | Coste v1 proveedor (USD) | Recargo cliente | Evidencia v2 | Decision local |
| --- | --- | --- | --- | --- | --- | --- |
| US | 15114 Black S | STANDARD | 4.95 | 0.00 | No requerida para US | eligible |
| ES | 15114 Black S | STANDARD | 4.99 | 0.00 | LV, false | eligible |
| FR | 15114 Black S | STANDARD | 4.99 | 0.00 | LV, false | eligible |
| DE | 15114 Black S | STANDARD | 4.99 | 0.00 | LV, false | eligible |
| IT | 15114 Black S | STANDARD | 4.99 | 0.00 | LV, false | eligible |
| PT | 15114 Black S | STANDARD | 4.99 | 0.00 | LV, false | eligible |
| ES | 15182 True Navy M | STANDARD | 4.99 | No ofertado | US, true | customs_risk |
| ES | 15182 True Navy M | STANDARD_CARBON_OFFSET | 5.08 | No ofertado | US, true | customs_risk |
| ES | 15114 + 15182 | STANDARD | 6.44 | No ofertado | Dos paquetes: LV false + US true | customs_risk |

Producto de las filas: Falling apart, sync product 468682936. Tambien se
observo US STANDARD_CARBON_OFFSET a 5.04 USD, mantenido como recargo opcional
(no altera Standard incluido). Estos valores son un snapshot, no nuevas
tarifas permanentes ni garantias del centro final.

Comprobacion adicional: hoodie variante 9648 a ES, v2 STANDARD 7.29 USD,
LV/false. La muestra crop 49803 con su configuracion DTF devolvio 400 por
combinacion no servible; no se interpreta como aduanas confirmadas ni se fuerza
otra tecnica. En el control nuevo, evidencia v2 no disponible impide iniciar
checkout UE. No se afirma que todas las variantes de la crop tengan ese mismo
resultado: renovar la consulta de la seleccion concreta.

La implementacion integrada en #27 repite el control completo en rates y en checkout.
Un metodo solo pasa con moneda/ID coherentes, todos los paquetes cubriendo
exactamente el carrito y todos los flags false. Un solo paquete con true
rechaza ese metodo; datos incompletos rechazan temporalmente sin inventar false.
La ruta puede cambiar despues de crear Stripe y no se anade revalidacion
automatica postpago. US no depende de v2; CA/GB siguen deshabilitados.

Estado al cierre del 11 de octubre: implementado, integrado mediante PR #27
(`929a725`) y desplegado en Vercel Production. Se comprobaron cotizaciones
publicas apta/riesgosa a ES y rechazo de CA/GB, sin crear checkout ni pedidos;
ver [cierre y evidencia](../LAUNCH_CHECKLIST.md#control-preventivo-aduanero-ue--2026-10-11).
La tabla anterior sigue siendo una muestra fechada, no un inventario permanente
de variantes permitidas. No cierra las plantillas ni cambia NO-GO a GO.
