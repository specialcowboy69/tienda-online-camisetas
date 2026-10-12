# Registro de stock Printful — 12 de octubre de 2026

## Alcance y entrega

Correccion acotada autorizada: resolver IDs de catalogo para `stock_updated`,
conservar el webhook existente, verificar y entregar por PR. Sin cambios de
productos, pedidos, pagos, fabricacion, secretos, Stripe Tax ni criterio `NO-GO`.

- PR funcional: [#31](https://github.com/specialcowboy69/tienda-online-camisetas/pull/31), `MERGED`.
- Commits revisados: `4e6c57b`, `2fe72450125bc5f26c34c0bb928fc95f6453b575`.
- Merge en main: `ff37910aa1fe6bf704ea331afffa3874f540a5bc`, 20:32:10 UTC.
- Preview READY: `dpl_7pNTbocahsPLM8f3yYgRFLFRkqp9`, SHA `2fe7245`.
- Production READY: `dpl_5xhcQjN9Sgxc8uZQDsMHH2kVxXDA`, SHA `ff37910`.
- Aliases comprobados: `www.funnyteesforall.com`, `funnyteesforall.com` y
  `tienda-online-camisetas.vercel.app`. Arbol funcional del merge identico al probado.

## Causa y protecciones

El registro enviaba `syncProductId` donde Printful exige IDs de productos de
su catalogo. GET `/webhooks` confirmo nueve eventos, incluido `stock_updated`,
pero parametros vacios (`[]`). La [API oficial](https://developers.printful.com/docs/#tag/Webhooks-API)
indica que el POST reemplaza la configuracion y que stock requiere `product_ids`.

Ahora se consultan los detalles de cada producto sincronizado, se comprueba la
identidad y el numero total de variantes y se deduplican los IDs de modelo de las
variantes no ignoradas. Cualquier respuesta incompleta impide escribir. El registro
conserva URL/secreto, tipos y parametros ajenos; una URL distinta exige revision
manual y una configuracion ya correcta no se vuelve a escribir.

## Verificacion local y revision

- Base: 681 tests. Primera regresion: 24 fallos observados antes del fix.
- Revision independiente: una incidencia P2 por lista parcial de variantes;
  reproducida con dos tests RED y corregida GREEN. Sin incidencias menores diferidas.
- Final: `npm.cmd test` **708/708**, 44 archivos; `npm.cmd run lint`,
  `npx.cmd tsc --noEmit --incremental false` y `npm.cmd run build`: exit 0.
- Transporte simulado para las regresiones: namespace de IDs, modelos multiples,
  duplicados, variantes ignoradas, configuracion ajena, no-op, vacios, metadata
  invalida, fallos HTTP, timeout/concurrencia y autenticacion administrativa.
- Estas pruebas no acreditan eventos autenticos de stock ni cambios comerciales.

## Comprobacion remota y efecto realizado

Firestore devolvio cinco productos activos. Lectura de Printful contrastada:

| Sync product ID | Variantes declaradas/recibidas | Catalog product ID |
| --- | --- | --- |
| 468682936 | 35/35 | 586 |
| 468513582 | 35/35 | 586 |
| 468502976 | 15/15 | 1579 |
| 468471370 | 15/15 | 317 |
| 468520575 | 30/30 | 162 |

El POST autenticado al endpoint administrativo **desplegado** respondio `200`
con `success=true`. GET posterior, **20:34:26 UTC**, confirmo:

- `params.stock_updated.product_ids = [162, 317, 586, 1579]`.
- URL y secreto exactamente iguales antes/despues (no se guardan aqui).
- Los nueve tipos de eventos y parametros no relacionados permanecen iguales.

Solo se escribio la configuracion del webhook. Credenciales locales existentes
usadas en memoria, sin extraccion nueva desde Vercel ni secretos en archivos de
trabajo, salida o commits. No se escribieron productos, stock, pedidos ni emails.

Despues del despliegue: home, `/products` y PDP real respondieron `200`;
registro administrativo sin autenticar respondio `401`.

## Pendiente: evento genuino nuevo

A las **20:35:16 UTC**, la consulta de `webhookEvents` con `source=printful`
devolvio 60 documentos (limite 250), ninguno `stock_updated`. El ultimo
`product_updated` observado data del **8 de septiembre, 22:22:11 UTC**, estado
`processed`: evidencia historica, no prueba del registro nuevo.

Mantener pendiente recibir un evento autentico posterior, comprobar su `processed`
y el efecto de sincronizacion en catalogo. No se ha provocado cambiando un producto
comercial ni se ha declarado una simulacion como evento real. No hay monitorizacion
de fondo nueva. Alertas/indices/rollback, legales y otros pendientes conservan su estado.
