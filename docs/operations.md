# Runbook Operativo

Este documento recoge los pasos practicos que han ido saliendo durante la puesta en marcha. No sustituye al `README.md`; lo complementa para operar la tienda sin tener que reconstruir la conversacion.

## Estado Del Proyecto

- Produccion despliega desde la rama `main` en Vercel.
- Los cambios nuevos deben prepararse en ramas `codex/...` y mergearse a `main` cuando esten revisados.
- La tienda usa Next.js, Firestore, Stripe Checkout, Printful y Resend.
- En pruebas, `ORDER_CONFIRM_PRINTFUL=false` debe mantenerse asi para que Printful cree pedidos en borrador y no los mande a fabricar.

## Flujo De Git

1. Crear rama desde `main`:

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/nombre-del-cambio
```

2. Hacer commits pequenos y enfocados.
3. Subir la rama:

```powershell
git push -u origin codex/nombre-del-cambio
```

4. Abrir pull request en GitHub.
5. Mergear a `main` solo cuando los checks y la revision esten bien.

No subir `.env.local` ni credenciales reales.

## Printful

### Configurar Webhook

Desde `/admin`, introducir `ADMIN_SECRET` y pulsar `Configure Printful webhook`.

La URL publica base es:

```text
https://tu-dominio.com/api/webhooks/printful
```

Si `PRINTFUL_WEBHOOK_SECRET` esta configurado, la app registra en Printful una URL con secreto y no devuelve el secreto al navegador.

### Probar Webhook

1. Cambiar algo pequeno en un producto de Printful, como nombre o precio.
2. Guardar el producto.
3. Revisar logs en Vercel buscando:

```text
POST /api/webhooks/printful
```

Resultado esperado:

```text
Status: 200
User Agent: Printful API Webhook Daemon
```

4. Revisar Firestore:

- `webhookEvents`: evento `printful:product_updated:...` o `printful:stock_updated:...` con `status: processed`.
- `products`: `updatedAt` reciente en el producto actualizado.

### Reintentar Pedidos En Revision

Desde `/admin`, pulsar `Load review orders` y luego `Retry` en el pedido.

Un `Status: 200` en Vercel significa que el endpoint admin respondio bien. Para saber si Printful acepto el pedido hay que mirar el documento en Firestore:

```text
status: printful_confirmed
printfulOrderId: <numero>
printfulStatus: draft
```

Con `ORDER_CONFIRM_PRINTFUL=false`, `printfulStatus: draft` es correcto.

Si queda en `manual_review`, revisar:

```text
orders/<orderId>/error.status
orders/<orderId>/error.details
```

El error `Invalid External ID specified` se resolvio normalizando IDs legacy con guiones antes de enviarlos a Printful. Los webhooks de Printful se resuelven de vuelta al pedido interno mediante `printfulExternalId`.

## Stripe

- Configurar el webhook publico en Stripe hacia `/api/webhooks/stripe`.
- Eventos esperados:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
refund.updated
```

No dejar `stripe listen` local reenviando eventos al mismo tiempo que el webhook publico de Stripe hacia Vercel, porque puede provocar dobles intentos del mismo evento.

## Resend

### Dominio Remitente

1. En Resend, anadir y verificar el dominio.
2. Si usas Cloudflare DNS, la configuracion automatica de Resend es suficiente cuando todos los registros aparecen verificados.
3. En Vercel, configurar:

```text
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=Tienda Online Camisetas <pedidos@tu-dominio.com>
```

Resend permite enviar desde una direccion del dominio verificado, pero no crea automaticamente una bandeja de entrada. Si quieres recibir respuestas en `pedidos@tu-dominio.com`, crea ese buzon o alias en tu proveedor de correo.

### Emails Que Envia La App

- Confirmacion de pedido cuando Stripe pago y Printful acepto el pedido.
- Envio con tracking cuando Printful manda `package_shipped`.

Si `RESEND_API_KEY` o `RESEND_FROM_EMAIL` falta, la app omite el envio del email y el flujo del pedido continua.

## Firestore

Colecciones principales:

- `products`: catalogo sincronizado desde Printful.
- `orders`: pedidos internos y estados de Stripe/Printful.
- `webhookEvents`: idempotencia y trazabilidad de eventos.
- `syncRuns`: historico de sincronizaciones.

Para diagnosticar un pedido:

1. Abrir `orders/<orderId>`.
2. Revisar `status`, `printfulOrderId`, `printfulExternalId`, `printfulStatus`.
3. Si hay fallo, revisar `error.status` y `error.details`.

## Checklist Antes De Venta Real

- Dominio final conectado a Vercel.
- `NEXT_PUBLIC_BASE_URL` actualizado al dominio final.
- Webhooks de Stripe y Printful apuntando al dominio final.
- `RESEND_API_KEY` y `RESEND_FROM_EMAIL` configurados en Vercel.
- Dominio remitente verificado en Resend.
- `ADMIN_SECRET`, `CRON_SECRET`, `PRINTFUL_WEBHOOK_SECRET` y credenciales sensibles rotadas con valores fuertes.
- Paginas legales, privacidad, devoluciones y contacto publicadas.
- Fiscalidad revisada antes de activar `STRIPE_TAX_ENABLED=true`.
- Stripe en modo live solo cuando todo lo anterior este cerrado.
- Compra real controlada con `ORDER_CONFIRM_PRINTFUL=true`.
