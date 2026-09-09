# Handoff Del Proyecto

Actualizado: 2026-09-09

## Resumen

Proyecto de tienda online de camisetas construido con Next.js, Firebase Firestore, Stripe Checkout y Printful API. El flujo principal ya está implementado: sincronizar catálogo desde Printful, mostrar productos, calcular envío con Printful, crear checkout en Stripe, recibir webhook de pago, crear pedido draft en Printful y actualizar estados mediante webhooks.

La app está pensada para desplegarse en Vercel. En pruebas, Printful debe seguir con `ORDER_CONFIRM_PRINTFUL=false` para crear pedidos en borrador y no mandar fabricar ni cobrar fulfillment.

## Estado Actual

- Repositorio GitHub: `specialcowboy69/tienda-online-camisetas`.
- Rama principal: `main`.
- Último commit conocido en `main`: `bb01dff Merge pull request #9 from specialcowboy69/codex/update-project-documentation`.
- Firestore está creado en el proyecto Firebase `tienda-online-camisetas`, región `eur3`.
- Printful store identificado como la tienda API/manual creada para el proyecto.
- Stripe está configurado en modo test y el flujo de pago de prueba llegó a funcionar end-to-end.
- Vercel está desplegando la app. Si `https://www.funnyteesforall.com` es el dominio final activo, `NEXT_PUBLIC_BASE_URL` y webhooks deben apuntar a ese dominio.
- Webhook correcto de Printful: `/api/webhooks/printful`.
- Webhook correcto de Stripe: `/api/webhooks/stripe`.
- El cálculo de envío debe enviar un carrito limpio con `toCartItemInputs()`; un `400` rápido sin llamadas externas suele indicar validación local.
- Se detectó que Stripe podía hacer dos intentos si quedaba abierto `stripe listen` local además del webhook público. El código se endureció para recuperar pedidos duplicados en Printful usando `external_id`.
- Los productos ignorados o borrados en Printful pueden seguir en Firestore, pero no deben aparecer en catálogo público.
- El sync completo de catálogo reconcilia Printful contra Firestore y marca como ignorados productos que ya no aparecen en Printful.
- La moneda de venta se gestiona en Printful/storefront settings y se refleja al sincronizar variantes activas en Firestore.
- El envío Standard está incluido para clientes; Printful Fast solo está incluido para US.
- La marca de trabajo es `No Context Club`; `Funny Tees 4 All` funciona como dominio/descriptor.

## Estructura Del Proyecto

```text
src/app/
  page.tsx                         Tienda pública.
  success/page.tsx                 Pantalla tras pago correcto.
  cancel/page.tsx                  Pantalla tras cancelar checkout.
  admin/page.tsx                   Panel admin mínimo.
  api/catalog/route.ts             Lee catálogo desde Firestore.
  api/catalog/sync/route.ts        Sincroniza catálogo desde Printful.
  api/shipping/rates/route.ts      Calcula envío con Printful.
  api/checkout/route.ts            Crea pedido interno y sesión Stripe.
  api/webhooks/stripe/route.ts     Webhook firmado de Stripe.
  api/webhooks/printful/route.ts   Webhook de eventos Printful.
  api/admin/orders/route.ts        Lista pedidos en revisión.
  api/admin/orders/[orderId]/retry-printful/route.ts
                                   Reintenta crear pedido en Printful.
  api/admin/printful/webhook/route.ts
                                   Configura webhook Printful desde admin.

src/components/
  storefront.tsx                   UI principal de compra.
  admin-panel.tsx                  Panel privado básico.

src/lib/
  cart.ts                          Serializa carrito UI a payload limpio para APIs.
  catalog-images.ts                Prioriza imagenes manuales antes que Printful.
  order-service.ts                 Orquesta checkout, webhooks y Printful.
  printful.ts                      Cliente Printful API v1.
  stripe.ts                        Cliente y Checkout de Stripe.
  firestore.ts                     Acceso a colecciones Firestore.
  firebase-admin.ts                Inicialización Firebase Admin.
  checkout-calculator.ts           Construcción de pedido y totales.
  validation.ts                    Validación de entradas y países.
  env.ts                           Variables de entorno.
  email.ts                         Emails transaccionales con Resend.
  money.ts                         Conversión/importes monetarios.
  *.test.ts                        Pruebas unitarias pequeñas.
```

## Colecciones Firestore

- `products`: catálogo sincronizado desde Printful, con productos y variantes.
- `orders`: pedidos internos, dirección, carrito, importes, Stripe IDs, Printful IDs, tracking y estado.
- `webhookEvents`: idempotencia y trazabilidad de eventos Stripe/Printful.
- `syncRuns`: historial de sincronizaciones de catálogo.

## Flujo Principal

1. El admin ejecuta sincronización de catálogo desde `/admin` o Vercel Cron llama `/api/catalog/sync`.
2. La tienda pública lee productos desde `/api/catalog`, excluyendo productos `isIgnored`.
3. El cliente introduce dirección y carrito.
4. `Storefront` limpia el carrito con `toCartItemInputs()` y `/api/shipping/rates` pide tarifas reales a Printful.
5. El servidor aplica reglas de envio incluido al cliente y recalcula esas reglas tambien en checkout.
6. `/api/checkout` crea un pedido interno en Firestore y una sesión de Stripe Checkout.
7. Stripe redirige al cliente al pago alojado.
8. `/api/webhooks/stripe` verifica la firma y procesa `checkout.session.completed`.
9. Si el pago coincide con el snapshot guardado, el pedido pasa a `paid`.
10. Se crea pedido en Printful con `external_id = order.id`.
11. Con `ORDER_CONFIRM_PRINTFUL=false`, Printful crea un draft order.
12. El pedido interno pasa a `printful_confirmed`.
13. `/api/webhooks/printful` actualiza envío, tracking, devoluciones, cancelaciones o productos.

## Estados De Pedido

```text
draft
checkout_created
paid
printful_pending
printful_confirmed
shipped
returned
failed
refunded
manual_review
expired
canceled
```

## Variables De Entorno

Estas variables son necesarias en `.env.local` y en Vercel. No deben subirse valores reales al repositorio.

```text
NEXT_PUBLIC_BASE_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_TAX_ENABLED
PRINTFUL_API_TOKEN
PRINTFUL_STORE_ID
PRINTFUL_WEBHOOK_SECRET
ORDER_CONFIRM_PRINTFUL
PRINTFUL_WEBHOOK_TYPES
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
ALLOWED_SHIPPING_COUNTRIES
ADMIN_SECRET
CRON_SECRET
RESEND_API_KEY
RESEND_FROM_EMAIL
TRUST_PROXY_HEADERS
RATE_LIMIT_FALLBACK_MULTIPLIER
```

Notas importantes:

- En local, `NEXT_PUBLIC_BASE_URL` debe ser `http://localhost:3000`.
- En Vercel, debe ser el dominio final, por ejemplo `https://www.funnyteesforall.com`, sin `/admin`.
- En staging/test, `ORDER_CONFIRM_PRINTFUL=false`.
- Solo poner `ORDER_CONFIRM_PRINTFUL=true` cuando Stripe live, fiscalidad, políticas, dominio, billing de Printful y compra real controlada estén listos.
- `STRIPE_TAX_ENABLED=false` hasta configurar Stripe Tax correctamente y validar obligaciones fiscales.
- No existe `STORE_CURRENCY`: la moneda se cambia desde Printful y se sincroniza al catálogo.

## Comandos Útiles

En Windows, si PowerShell bloquea scripts `.ps1`, usar `npm.cmd`.

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev
& "C:\Program Files\nodejs\npm.cmd" test
& "C:\Program Files\nodejs\npm.cmd" run lint
& "C:\Program Files\nodejs\npm.cmd" run build
```

Stripe CLI puede ejecutarse como `stripe.cmd`, pero no conviene dejar `stripe listen` abierto cuando también está activo el webhook público de Stripe hacia Vercel, porque puede reenviar el mismo evento al entorno local.

## Verificación Ya Realizada

- Build de Next.js funcionando.
- Tests unitarios funcionando.
- Lint funcionando con aviso conocido de `<img>` en `storefront.tsx`.
- Sincronización de producto Printful hacia Firestore funcionando.
- Cálculo de envío corregido para no enviar campos visuales del carrito a APIs públicas.
- Envio Standard incluido para cliente y Printful Fast incluido solo en US.
- Imagenes manuales de storefront priorizadas sobre imagenes de Printful.
- Pago test de Stripe funcionando.
- Creación de pedido draft en Printful funcionando.
- Recuperación de duplicados de pedido Printful implementada.
- Webhook Printful configurado contra la URL correcta de producción.
- Productos ignorados ocultos de la tienda pública.
- Productos ausentes de Printful reconciliados como `isIgnored` en sync completo.
- Catálogo activo sincronizado en USD tras cambiar moneda desde Printful.

## Pendiente Recomendado

1. Mantener una prueba operativa del webhook de Printful: cambiar un producto/stock y confirmar evento en `webhookEvents` y actualización en Firestore.
2. Cerrar configuración final de Resend si falta dominio/remitente.
3. Revisar textos de email y tienda para dejarlos en español y con tono de marca.
4. Sustituir secretos fuertes si se usaron durante pruebas.
5. Confirmar dominio final, `NEXT_PUBLIC_BASE_URL` y webhooks alineados.
6. Completar páginas legales, política de devoluciones, privacidad y contacto.
7. Configurar Stripe live, webhook live y claves live cuando la tienda esté lista.
8. Validar fiscalidad antes de activar Stripe Tax.
9. Hacer una compra real controlada con `ORDER_CONFIRM_PRINTFUL=true`.

## Riesgos Y Cuidados

- No subir `.env.local` ni credenciales reales a GitHub.
- El token de Printful y la clave privada Firebase que se pegaron durante la configuración deberían rotarse antes de producción.
- Printful sin `ORDER_CONFIRM_PRINTFUL=true` no fabrica pedidos, solo crea borradores.
- Si hay webhook público de Stripe y Stripe CLI escuchando a la vez, pueden aparecer intentos duplicados del mismo evento.
- Los webhooks externos no deben estar detrás de protección de despliegue en Vercel.

## Próximo Paso Natural

Hacer un smoke test completo en dominio final: catálogo, cálculo de envío, checkout test, webhook Stripe, webhook Printful, emails y Firestore. Después, cerrar textos/legales/secretos antes de Stripe live.
