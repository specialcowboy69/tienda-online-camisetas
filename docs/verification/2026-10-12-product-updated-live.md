# Evento autentico product_updated — 12 de octubre de 2026

## Alcance y entorno

Prueba remota autorizada de un cambio minimo y reversible en un producto.
No es una simulacion enviada directamente al endpoint ni una sincronizacion
manual del catalogo: Printful genero los dos eventos observados.

- Deployment Production: `dpl_MBy67mxbAQ4jmK4b6e6JBbEauJSq`, `READY`.
- SHA desplegado: `41f9e3ae35b31000b3d181b31a2752a63375bcea` (merge documental #32;
  conserva el cambio funcional de registro #31).
- Dominio: `https://www.funnyteesforall.com`.
- Producto: `468682936`, Falling apart, 35 variantes sincronizadas.
- Inicio: `2026-10-12T21:01:36.431Z`; comprobacion final: `21:02:23.955Z`.

## Accion y protecciones

Se verifico que `CatalogProduct.externalId` no interviene en el precio, las
imagenes, el nombre publico ni la seleccion de variantes para pedidos. El flujo
de pedidos usa `sync_variant_id`; no se modifico ningun identificador de variante.

Tras guardar el estado original, se cambio solamente `sync_product.external_id`
de `6aa089f4c95b67` a `whcheck-1791838896430`. El PUT no incluyo `sync_variants`,
nombre, precio, imagenes ni disponibilidad. Se hizo una segunda lectura antes de
escribir para descartar cambios concurrentes, y se programo la restauracion en
un bloque `finally`, incluso ante timeout o fallo de la prueba.

La configuracion leida conservaba los nueve eventos existentes y
`params.stock_updated.product_ids = [162, 317, 586, 1579]`.
No se escribio la configuracion del webhook ni se expuso su URL autenticada.

## Evidencia observada

| Paso | Evento genuino registrado en webhookEvents | Resultado |
| --- | --- | --- |
| Cambio interno | `product_updated:1791838902:18536834:468682936` | `processed`, retries 0; payload con el marcador temporal |
| Restauracion | `product_updated:1791838925:18536834:468682936` | `processed`, retries 0; payload con el identificador original |

- Primer evento creado a las `21:01:42Z`, procesado a las `21:01:47.215Z`.
  Firestore contenia el marcador, con `updatedAt=21:01:46.371Z`.
- Restauracion solicitada a las `21:02:02.160Z`; GET de Printful confirmo el valor
  original a las `21:02:03.326Z`.
- Segundo evento creado a las `21:02:05Z`, procesado a las `21:02:09.585Z`.
  Firestore volvio al identificador original, con `updatedAt=21:02:08.660Z`.
- Comparacion canonica del detalle completo de Printful, excluyendo unicamente
  el identificador temporal: sin cambios, tanto durante la prueba como al restaurar.
  Se conservaron las 35 variantes y sus datos comerciales.
- Comparacion de los 17 documentos de catalogo de Firestore, excluyendo solo
  `updatedAt` y el `externalId` del producto probado: sin cambios en ambos pasos.
  Incluye imagenes manuales y campos comerciales; 17 documentos no significa
  17 productos publicos, ya que se conservan productos ignorados historicos.
- PDP publico `/products/falling-apart-cat-graphic-tee`: HTTP `200`, titulo esperado
  presente y marcador temporal ausente del HTML despues de restaurar.
- El script de verificacion termino con exit 0; no se ejecutaron tests/build
  nuevamente porque no se cambio codigo de aplicacion ni dependencias.

Huellas SHA-256 de las comparaciones de referencia (JSON ordenado):

- Detalle Printful sin `sync_product.external_id`:
  `9ea2c8c59887739221af03de8942cf9f537f462d06b62567c1e7923ddf8e8b76`.
- Catalogo Firestore sin los campos volatiles indicados:
  `5ebd9e0811207501de756e93412eb1e5c1642070f20e0e98f70eb77e0e864bfb`.

## Cierre y limites

Queda comprobado el circuito real **Printful -> webhook desplegado -> evento
processed -> catalogo Firestore**, incluida la restauracion. El producto queda
con sus valores originales. No se crearon pedidos, cobros, correos ni fabricacion;
no se cambiaron secretos, Stripe Tax ni configuracion de produccion.

Esta evidencia cierra la prueba de actualizacion de **producto**, no la de
`stock_updated`. Sigue pendiente observar un cambio autentico de stock del
catalogo de Printful y verificar su efecto. No acredita envio fisico, tracking,
activacion de alertas ni rollback. Se mantiene `NO-GO`.

Credenciales existentes usadas solo en memoria. Los scripts y snapshots
temporales ignorados se retiraron tras guardar este informe; no se copiaron
credenciales, pedidos ni URLs autenticadas a la documentacion.
