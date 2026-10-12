# Verificacion de webhooks, tracking y operacion — 2026-10-12

> Evidencia historica: conserva los resultados y pendientes de esa ejecucion.
> Estado actual en [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md). El mismo 12 de
> octubre se integraron las alertas desactivadas (#29), se corrigio el registro
> de stock (#31) y se verifico [product_updated y restauracion](2026-10-12-product-updated-live.md).
> Las [capturas de Gmail](2026-10-12-webhooks-tracking-operations.md#correo-recibido-evidencia-aportada-por-la-persona-propietaria)
> acreditan despues la recepcion de los dos mensajes del dia 11.


## Alcance y resultado

La persona propietaria autorizo revisar producto/stock, simular el circuito de
envio sin fabricar, preparar alertas y ensayar rollback fuera de produccion.
Esta ejecucion completa verificaciones locales aisladas y lecturas remotas;
no acredita un envio fisico ni un cambio de deployment. No se modificaron
pedidos, catalogo remoto, suscripciones, secretos, Stripe Tax ni fabricacion.
El lanzamiento sigue **NO-GO**.

## Correo recibido: evidencia aportada por la persona propietaria

El 12 de octubre se aportaron dos capturas de Gmail mostrando la etiqueta
Recibidos y el contenido de mensajes del 11 de octubre:

- `Order #8FA67DCC confirmed`, 21:06, confirmacion de la prueba de USD 39.99.
- `TEST ONLY - No Context Club email recovery`, 21:11, prueba de recuperacion.

Esto cierra la recepcion en bandeja de esos dos mensajes concretos, antes
limitada a aceptacion de Resend. No acredita correo de envio, visualizacion
movil, todos los proveedores de correo, rebotes ni recepcion del canal de
soporte de la tienda. No se accedio al buzon ni se copiaron las capturas al repo.

## Prueba local aislada de envio y catalogo

Comandos ejecutados sobre el codigo funcional de `6c963d0`:

```powershell
npx.cmd --no-install vitest run src/lib/printful-webhook-route.test.ts src/lib/printful-webhook.test.ts src/lib/email.test.ts src/lib/email-jobs.test.ts
npx.cmd --no-install vitest run .superpowers/launch-isolated-20261012.test.ts
```

- Regresiones existentes: **39/39**, cuatro archivos, exit 0.
- Probe temporal adicional: **5/5**, exit 0; retirado al terminar. No se anade
  como test permanente ni como cambio de producto.
- El probe usa parser Zod, handler HTTP, funciones de persistencia, cola y
  renderer de email reales. La interfaz Firestore se sustituye por un adaptador
  transaccional en memoria y `fetch` por respuestas sinteticas; las llamadas
  no previstas fallan. No carga credenciales reales ni accede a proveedores.

Casos observados:

1. `package_shipped` guarda estado `shipped`, numero y URL de seguimiento;
   genera HTML con `View tracking` y el enlace esperado, y un job aceptado por
   el transporte simulado. Repetir el mismo evento no duplica el correo;
   un segundo paquete crea su propio job.
2. Respuesta 503 simulada del correo deja job pendiente y webhook reintentable;
   el replay conserva cuerpo y clave de idempotencia, acepta el segundo intento
   y no vuelve a enviar tras un tercer replay.
3. URL `javascript:` rechazada con 400 antes de guardar o enviar.
4. `product_updated` refresca nombre, precio y disponibilidad desde la respuesta
   simulada del proveedor, conservando `storefrontImage` del comerciante.
5. `stock_updated` recorre ese mismo refresco. La disponibilidad viene de la
   consulta de catalogo, no de aplicar directamente `variant_stock` al documento.

Limites: no es Firestore Emulator ni Firestore remoto; no demuestra la entrega
HTTP de Printful a Vercel, disponibilidad real de stock, aceptacion real de un
email de envio ni exactitud de un tracking del transportista. No sustituye una
regresion permanente al corregir el registro de stock.

## Stock: hallazgo de configuracion y codigo

Dos consultas GET autenticadas a `/webhooks` devolvieron 200, nueve tipos
registrados y destino `https://www.funnyteesforall.com/api/webhooks/printful`.
El secreto esta presente en el destino, pero se omite de esta evidencia.
`params` esta vacio: no hay `params.stock_updated.product_ids`.

La [documentacion oficial](https://developers.printful.com/docs/#tag/Webhooks-API)
requiere indicar los productos vigilados para stock. Tener el tipo en la lista
no demuestra una suscripcion efectiva a los productos de esta tienda.

El registro local en `src/app/api/admin/printful/webhook/route.ts` pasa
`syncProductId` de Firestore a `configurePrintfulWebhook`; son IDs de productos
sincronizados de la tienda, no los IDs de modelos del catalogo Printful.
Lectura actual de cinco productos y sus detalles:

| Producto | Sync Product ID | Catalog Product ID |
| --- | --- | --- |
| Falling apart | 468682936 | 586 |
| Sorry i cant triblend | 468520575 | 162 |
| Farming dog aura | 468513582 | 586 |
| Its a trap crop top | 468502976 | 1579 |
| Momma sorry sweeter | 468471370 | 317 |

La correccion propuesta es resolver y deduplicar los IDs de catalogo desde los
detalles del proveedor, sin cambiar el modelo comercial de Firestore, y probar
el contrato antes de actualizar la suscripcion. Los cuatro IDs observados son
`162`, `317`, `586`, `1579`; no deben congelarse en codigo como catalogo perpetuo.
No se ejecuto POST `/webhooks`: reemplaza la configuracion entera y debe preservar
URL, secreto y tipos existentes. El fix y su configuracion quedan pendientes.

Lectura de los ultimos 150 documentos por `updatedAt`: 101 resultados;
44 `product_updated`, el ultimo del 8 de septiembre; cero `stock_updated` y cero
`package_shipped`. Es un muestreo de registros, no prueba de que no hubo ningun
intento HTTP fuera de ellos. No se cambio un producto comercial para provocar
un evento artificial. Un evento autentico nuevo sigue pendiente.

## Vercel y rollback

El conector respondio 403; las consultas equivalentes por CLI funcionaron.
Equipo `specialcowboy69s-projects`, plan **Hobby**, Node **24.x**.

- Produccion actual `Ready`: `dpl_BxnBcM8pj5nUbxXbEZiJz6xQBWVP`,
  SHA `6c963d08870bb0d24a949d131b68ff0b87c2aa66`.
- Candidato anterior `Ready`: `dpl_CrSpQJxUieUtBRcGF1JTGyAXFCU6`,
  SHA `929a72583cca395cc1027a503dae2c9f4ed502f9`.
- Preview actual `Ready`: `dpl_54TMTQCjL4we6RJ4Wqefcofcibtk`, rama
  `codex/docs-launch-status-20261011`, SHA
  `40c991cf1033002b126fb7e57d6a5f9ff510c608`.

No hay diferencias entre candidato y produccion en `src`, `package.json`,
lockfile, `vercel.json` ni `next.config.ts`. Esto no garantiza igualdad de
variables efectivas ni revierte los efectos externos.

La metadata actual de variables muestra entradas compartidas por Preview y
Production para Firebase, Stripe, token/store Printful y secretos admin/cron.
Resend y el secreto del webhook Printful estan configurados solo en Production.
No se descifraron ni compararon valores. No se puede tratar ese preview como
entorno aislado de datos ni como replica completa para correos/webhooks.

**No se ejecuto rollback**, ni se movio un alias, creo un proyecto o copio secretos.
Para un ensayo efectivo hace falta un sandbox sin acceso a los datos y proveedores
productivos; cambiar una URL preview por si solo no crea ese aislamiento.
El candidato sigue identificado, no ensayado. Se mantiene vigilancia manual.

## Alertas: decision y siguiente puerta de revision

La persona propietaria eligio avisos por incidencia y resumen diario a su correo
controlado, sin reintentar pedidos automaticamente. El plan Hobby admite cron
diario, no cada pocos minutos; ver [limites oficiales](https://vercel.com/docs/cron-jobs/usage-and-pricing).

Se preparo la [especificacion](../superpowers/specs/2026-10-12-operational-alerts-design.md).
Es un subsistema nuevo: la opcion esta aprobada, la especificacion escrita y
su posterior plan aun necesitan revision. No hay alertas implementadas,
activadas ni programadas por esta tarea. La recepcion de solicitudes de clientes
seguira siendo una tarea humana, no una capacidad atribuida a estas alertas.

**Actualizacion posterior del mismo dia:** la persona propietaria aprobo la
especificacion. Se redacto y autorreviso el
[plan de implementacion](../superpowers/plans/2026-10-12-operational-alerts.md),
pendiente de revision y eleccion del metodo de ejecucion. Esta aprobacion no
modifica los resultados de las pruebas anteriores ni activa alertas.
