# Arquitectura

## Resumen

La aplicacion es una tienda online de camisetas con frontend y backend dentro de Next.js App Router.

- Frontend: paginas y componentes React en `src/app` y `src/components`.
- Backend: API routes de Next.js en `src/app/api`.
- Base de datos: Firebase Firestore.
- Pagos: Stripe Checkout y webhook de Stripe.
- Produccion/fulfillment: Printful API y webhook de Printful.
- Emails: Resend, opcional segun variables de entorno.
- Despliegue previsto: Vercel, deducido por `vercel.json` y cron configurado.

## Estructura principal

- `src/app`: paginas publicas, pagina admin y rutas API.
- `src/components`: interfaz de tienda y panel admin.
- `src/lib`: logica compartida del backend, clientes externos, tipos, validacion y tests.
- `docs`: documentacion del proyecto y planes.
- `.env.example`: plantilla de variables de entorno.
- `vercel.json`: cron diario para sincronizar catalogo.

## Flujo de catalogo

1. Un admin o cron llama a `/api/catalog/sync`.
2. La ruta valida `ADMIN_SECRET` o `CRON_SECRET`.
3. `fetchPrintfulCatalog()` lee productos y variantes desde Printful.
4. `saveCatalogProducts()` guarda el catalogo en Firestore.
5. La tienda lee productos activos desde Firestore.

Colecciones implicadas:

- `products`
- `syncRuns`

## Flujo de compra

1. El cliente anade productos al carrito en `Storefront`.
2. La tienda pide tarifas a `/api/shipping/rates`.
3. La ruta aplica rate limit y limite de cuerpo JSON antes de procesar.
4. `quoteShipping()` valida pais, carga productos de Firestore y pide tarifas a Printful.
5. El cliente elige tarifa y llama a `/api/checkout`.
6. `createCheckout()` crea un pedido interno en Firestore y una sesion de Stripe Checkout.
7. El cliente paga en Stripe.

Colecciones implicadas:

- `products`
- `orders`

## Flujo de Stripe

1. Stripe llama a `/api/webhooks/stripe`.
2. La ruta lee el cuerpo crudo y valida `stripe-signature` con `STRIPE_WEBHOOK_SECRET`.
3. `handleStripeWebhook()` evita duplicados con `webhookEvents`.
4. Si el pago esta confirmado, comprueba importe, moneda y direccion.
5. Si todo cuadra, marca el pedido como `paid` y lo envia a Printful.
6. Si algo no cuadra, manda el pedido a `manual_review`.

Eventos escuchados:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `refund.updated`

## Flujo de Printful

1. Printful llama a `/api/webhooks/printful`.
2. La ruta valida `PRINTFUL_WEBHOOK_SECRET` antes de leer/procesar el cuerpo.
3. Valida que el evento pertenezca al `PRINTFUL_STORE_ID` esperado, si esta configurado.
4. Usa `webhookEvents` para evitar procesar duplicados.
5. Actualiza pedidos o catalogo segun el tipo de evento.
6. En envios, actualiza tracking y dispara email de envio via Resend si esta configurado.

Eventos relevantes:

- `package_shipped`
- `package_returned`
- `order_canceled`
- `order_put_hold`
- `order_remove_hold`
- `product_updated`
- `product_deleted`
- `stock_updated`

## Modelo de datos

`products` guarda productos sincronizados desde Printful:

- id de producto sincronizado
- nombre, miniatura y variantes
- precio, moneda, talla, color, imagen
- flags de ignorado/disponibilidad

`orders` guarda pedidos internos:

- datos del comprador y direccion
- items congelados en el momento de compra
- tarifa de envio elegida
- totales
- estado interno
- ids de Stripe y Printful
- tracking
- error operativo si requiere revision

`webhookEvents` evita duplicados de Stripe y Printful:

- origen
- id del evento
- payload
- estado `processing`, `processed` o `failed`
- intentos y error si aplica

`syncRuns` registra resultados de sincronizacion de catalogo.

## Estados de pedido

Los estados actuales estan definidos en `src/lib/types.ts`:

- `draft`
- `checkout_created`
- `paid`
- `printful_pending`
- `printful_confirmed`
- `shipped`
- `returned`
- `failed`
- `refunded`
- `manual_review`
- `expired`
- `canceled`

## Seguridad actual

- Admin: `ADMIN_SECRET` por header `x-admin-secret` o bearer.
- Cron: `CRON_SECRET` por bearer.
- Stripe webhook: firma oficial de Stripe.
- Printful webhook: secreto compartido por query param o header.
- Endpoints publicos: rate limit en memoria, limite de cuerpo JSON y validacion estricta.

Limitacion importante: el rate limit en memoria es por instancia de runtime. En produccion con multiples instancias, conviene pasar a un almacenamiento compartido.

## Servicios externos

- Printful: catalogo, tarifas de envio, pedidos y webhooks.
- Stripe: Checkout, pagos, reembolsos y webhooks.
- Firebase Admin / Firestore: persistencia.
- Resend: emails transaccionales.
- Vercel: hosting y cron diario de catalogo.
