# Seguridad

## Principios

- Los secretos nunca deben vivir en git.
- Los endpoints publicos deben rechazar entradas invalidas antes de trabajo costoso.
- Los webhooks deben autenticar antes de procesar.
- Los pagos y pedidos deben ser idempotentes.
- Cualquier cambio de seguridad necesita pruebas y verificacion completa.

## Secretos sensibles

Variables especialmente sensibles:

- `ADMIN_SECRET`
- `CRON_SECRET`
- `PRINTFUL_API_TOKEN`
- `PRINTFUL_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `FIREBASE_PRIVATE_KEY`
- `RESEND_API_KEY`

Si alguno se pego en chats, capturas, logs o pruebas compartidas, hay que rotarlo.

## Autenticacion admin y cron

Endpoints admin:

- `/api/catalog/sync`
- `/api/admin/orders`
- `/api/admin/orders/[orderId]/retry-printful`
- `/api/admin/printful/webhook`

Autenticacion:

- Admin: `x-admin-secret` o `Authorization: Bearer ADMIN_SECRET`.
- Cron: `Authorization: Bearer CRON_SECRET`.

Limitacion: esto es suficiente para una fase inicial, pero no sustituye un sistema de usuarios/roles si el panel admin crece.

## Webhooks

Stripe:

- `/api/webhooks/stripe`
- Requiere firma `stripe-signature`.
- Usa `STRIPE_WEBHOOK_SECRET`.
- Registra eventos para evitar duplicados.

Printful:

- `/api/webhooks/printful`
- Requiere `PRINTFUL_WEBHOOK_SECRET` por query param o header.
- Rechaza el evento antes de procesar si el secreto no coincide.
- Verifica `PRINTFUL_STORE_ID` si esta configurado.
- Registra eventos para evitar duplicados.

Riesgo operativo: si el secreto de Printful va en query param, los logs de infraestructura deben evitar exponer query strings completas.

## Endpoints publicos

Endpoints publicos principales:

- `/api/shipping/rates`
- `/api/checkout`

Controles actuales:

- Rate limit en memoria.
- Fallback global mas amplio cuando no hay identidad fiable de cliente.
- Headers proxy no confiados por defecto.
- Limite de cuerpo JSON de 64 KiB.
- Validacion estricta de campos.

Limitacion: el rate limit no es distribuido. En produccion con multiples instancias, se recomienda usar Redis, Upstash, Vercel KV u otro backend compartido.

## Dependencias

`npm audit --omit=dev` sigue reportando vulnerabilidades productivas que requieren upgrades mayores:

- Next necesita upgrade mayor para resolver advisories de `postcss` y `sharp`.
- Firebase Admin necesita upgrade mayor para resolver advisory de `uuid` en dependencias transitivas.
- No se debe forzar el upgrade sin una tarea especifica de compatibilidad.

## Checklist antes de produccion

- Rotar secretos fuertes.
- Configurar dominio final y `NEXT_PUBLIC_BASE_URL`.
- Confirmar webhooks de Stripe y Printful contra dominio final.
- Verificar que Resend usa dominio validado.
- Mantener `ORDER_CONFIRM_PRINTFUL=false` hasta la compra real controlada.
- Mantener Stripe en test hasta cerrar textos, legales, secretos y fiscalidad.
- Validar fiscalidad antes de activar Stripe Tax.
