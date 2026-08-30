# Roadmap

## Estado actual

La tienda ya tiene una base funcional:

- Catalogo sincronizado desde Printful.
- Carrito y checkout con Stripe.
- Pedidos guardados en Firestore.
- Webhook de Stripe con idempotencia.
- Webhook de Printful protegido.
- Emails transaccionales con Resend si esta configurado.
- Panel admin basico.
- Rate limiting y validacion en endpoints publicos.
- Tests de logica critica.

## Pasos por delante

### 1. Webhook de Printful hacia Vercel

Estado: solucionado en codigo, pendiente de prueba real si no se ha hecho ya.

Objetivo: cambiar algo en Printful y confirmar que `/api/webhooks/printful` actualiza Firestore.

Resultado esperado:

- Evento registrado en `webhookEvents`.
- Pedido o catalogo actualizado en Firestore.
- No hay errores silenciosos.

### 2. Resend para emails transaccionales

Estado: integrado en codigo, pendiente de configuracion final/dominio si aplica.

Objetivo: asegurar emails de confirmacion, envio y estados importantes.

Resultado esperado:

- Dominio verificado en Resend.
- `RESEND_FROM_EMAIL` con remitente real.
- Emails probados en modo controlado.

### 3. Textos visibles y tono de marca

Objetivo: revisar tienda, checkout-facing copy y emails en espanol.

Incluye:

- Botones.
- Mensajes de error.
- Mensajes de exito.
- Emails HTML y texto plano.
- Nombre de marca y tono.

### 4. Rotacion de secretos

Objetivo: cambiar secretos fuertes antes de produccion.

Incluye:

- `ADMIN_SECRET`
- `CRON_SECRET`
- `PRINTFUL_API_TOKEN`
- `PRINTFUL_WEBHOOK_SECRET`
- Credenciales Firebase si se compartieron.
- Claves Stripe/Resend si se expusieron.

### 5. Dominio final en Vercel

Objetivo: conectar el dominio real y ajustar `NEXT_PUBLIC_BASE_URL`.

Depende de:

- Dominio elegido.
- DNS configurado.
- Webhooks actualizados.

### 6. Paginas legales

Objetivo: crear paginas publicas necesarias antes de vender.

Minimo:

- Privacidad.
- Devoluciones.
- Contacto.
- Condiciones.

Estas paginas deben revisarse legalmente si el proyecto va a vender de verdad.

### 7. Stripe live

Objetivo: pasar de modo test a modo live solo cuando la tienda este preparada.

No hacerlo antes de cerrar:

- Textos.
- Legales.
- Secretos.
- Dominio.
- Webhooks.
- Fiscalidad.

### 8. Fiscalidad y Stripe Tax

Objetivo: validar obligaciones fiscales antes de activar `STRIPE_TAX_ENABLED=true`.

Decision pendiente:

- Si se usa Stripe Tax.
- En que paises se vende.
- Que datos fiscales debe mostrar la tienda.

### 9. Compra real controlada

Objetivo: hacer una compra real de bajo riesgo con `ORDER_CONFIRM_PRINTFUL=true`.

Checklist:

- Producto barato o pedido interno controlado.
- Stripe live configurado.
- Printful billing listo.
- Tracking y emails observados.
- Plan de rollback preparado.

## Deuda tecnica importante

- Rate limit en memoria: mover a almacenamiento compartido si hay trafico real.
- Dependencias: plan dedicado para upgrades mayores de Next y Firebase Admin.
- Admin: valorar autenticacion mas robusta si el panel crece.
- Tests: anadir pruebas e2e/smoke para el flujo completo cuando haya entorno estable.
- Observabilidad: definir logs y alertas para webhooks fallidos y pedidos en `manual_review`.
