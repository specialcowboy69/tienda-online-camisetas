# Despliegue

## Plataforma prevista

El proyecto esta preparado para desplegarse en Vercel. `vercel.json` define un cron diario:

```json
{
  "path": "/api/catalog/sync",
  "schedule": "0 3 * * *"
}
```

Ese cron sincroniza catalogo de Printful a Firestore una vez al dia.

## Variables de entorno

Configurar en Vercel, no en git:

- `NEXT_PUBLIC_BASE_URL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_TAX_ENABLED`
- `PRINTFUL_API_TOKEN`
- `PRINTFUL_STORE_ID`
- `PRINTFUL_WEBHOOK_SECRET`
- `ORDER_CONFIRM_PRINTFUL`
- `PRINTFUL_WEBHOOK_TYPES`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `ALLOWED_SHIPPING_COUNTRIES`
- `ADMIN_SECRET`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `TRUST_PROXY_HEADERS`
- `RATE_LIMIT_FALLBACK_MULTIPLIER`

`NEXT_PUBLIC_BASE_URL` debe apuntar al dominio publico real. En local puede ser `http://localhost:3000`. Es una variable publica a proposito: solo contiene la URL base que el navegador tambien puede conocer.

Si `https://www.funnyteesforall.com` es el dominio final activo, usar esa URL sin ruta final ni slash innecesario.

## Moneda de venta

La moneda que ve y paga el cliente se gestiona en Printful/storefront settings. Despues de cambiarla:

1. Sincronizar catalogo desde admin o esperar el webhook de Printful.
2. Confirmar que las variantes activas de Firestore tienen la moneda esperada.
3. Probar envio y checkout en modo test.

No configurar `STORE_CURRENCY` ni otro override en la app salvo que se decida cambiar la arquitectura.

## Webhooks

Stripe:

```text
https://tu-dominio.com/api/webhooks/stripe
```

Eventos:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `refund.updated`

Printful:

```text
https://tu-dominio.com/api/webhooks/printful?secret=PRINTFUL_WEBHOOK_SECRET
```

Preferible: configurar desde el panel admin para que use el valor actual de `NEXT_PUBLIC_BASE_URL` y el secreto.

## Orden recomendado antes de live

Ya estan completados o en proceso: webhook de Printful protegido, Resend integrado, dominio conectado, moneda gestionada desde Printful, productos ignorados ocultos y payload limpio de carrito para envio/checkout.

Mantener como controles operativos:

1. Probar webhook de Printful hacia Vercel.
2. Configurar Resend para emails de confirmacion, envio y estados importantes.

Despues:

1. Revisar textos visibles de tienda y emails en espanol.
2. Rotar secretos fuertes si se usaron durante pruebas.
3. Crear paginas legales.
4. Confirmar webhooks contra el dominio final.
5. Pasar Stripe a live.
6. Validar fiscalidad antes de activar Stripe Tax.
7. Hacer compra real controlada con `ORDER_CONFIRM_PRINTFUL=true`.

## Smoke test despues de desplegar

1. Abrir tienda publica.
2. Confirmar que carga catalogo desde Firestore.
3. Calcular envio con un carrito pequeno y confirmar que no hay `400` local de validacion.
4. Crear checkout en Stripe test.
5. Completar pago de prueba.
6. Confirmar pedido en Firestore.
7. Confirmar evento de Stripe en `webhookEvents`.
8. Confirmar pedido draft/confirmado en Printful segun `ORDER_CONFIRM_PRINTFUL`.
9. Probar evento real o simulado de Printful, idealmente cambio de producto/stock.
10. Confirmar email si Resend esta activo.

## Rollback basico

Si algo falla tras desplegar:

- Revertir al deployment anterior en Vercel.
- Mantener `ORDER_CONFIRM_PRINTFUL=false` mientras se investiga.
- Revisar eventos en Stripe, Printful y Firestore.
- No reintentar pedidos manualmente sin comprobar duplicados por `printfulExternalId`.
