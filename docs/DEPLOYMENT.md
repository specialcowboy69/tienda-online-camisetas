# Despliegue

## Plataforma y referencia de estado

La tienda se despliega desde `main` en Vercel Production y es publica en
`https://www.funnyteesforall.com`. Esto no equivale a autorizar pagos live.
El cierre de #27 (`929a725`, 11 de octubre) y la evidencia del dominio estan en
[LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md), referencia principal de estado.
No inferir secretos, valores efectivos de entorno ni autorizacion de fabricacion
a partir de que un deployment este `Ready`.

`vercel.json` define un cron diario:

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

Los destinos de envio activos son ES, FR, DE, IT, PT y US. CA y GB estan
temporalmente deshabilitados en la aplicacion, incluso si aparecen en
`ALLOWED_SHIPPING_COUNTRIES` en Vercel. No volver a habilitarlos hasta validar
una tarifa DDP real, el flujo de checkout y la informacion al cliente.

`NEXT_PUBLIC_BASE_URL` debe apuntar al dominio publico real. En local puede ser `http://localhost:3000`. Es una variable publica a proposito: solo contiene la URL base que el navegador tambien puede conocer.

Si `https://www.funnyteesforall.com` es el dominio final activo, usar esa URL sin ruta final ni slash innecesario.

## Moneda de venta

La moneda que ve y paga el cliente se gestiona en Printful/storefront settings. Despues de cambiarla:

1. Sincronizar catalogo desde admin o esperar el webhook de Printful.
2. Confirmar que las variantes activas de Firestore tienen la moneda esperada.
3. Probar envio y checkout en modo test.

No configurar `STORE_CURRENCY` ni otro override en la app salvo que se decida cambiar la arquitectura.

## Idioma publico

La tienda publica esta pensada en ingles por ahora:

- `lang="en"` en el documento HTML.
- Copy visible y emails transaccionales en ingles.
- Printful shipping locale `en_US`.
- Formato monetario de emails `en-US`.

Mantener la documentacion interna en espanol es aceptable. Antes de live,
confirmar en el dominio final que home, checkout, success/cancel y emails no
mezclan idiomas.

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
- `refund.created`
- `refund.updated`
- `refund.failed`

Printful:

```text
https://tu-dominio.com/api/webhooks/printful?secret=PRINTFUL_WEBHOOK_SECRET
```

Preferible: configurar desde el panel admin para que use el valor actual de `NEXT_PUBLIC_BASE_URL` y el secreto.

## Orden recomendado antes de live

Ya estan completados o en proceso: webhook de Printful protegido, Resend integrado, dominio conectado, moneda gestionada desde Printful, productos ignorados ocultos y payload limpio de carrito para envio/checkout.

Mantener como controles operativos, partiendo de la evidencia ya registrada:

1. Completar eventos Printful aun pendientes: `order_created` ya se observo;
   no acredita envio real ni prueba dedicada de producto/stock.
2. Comprobar entrega/recuperacion de email cuando se retome: la aceptacion
   por Resend ya esta documentada, no es entrega en bandeja.

Despues:

1. Pulir textos visibles de tienda y emails en ingles con tono de marca.
2. Rotar secretos fuertes si se usaron durante pruebas.
3. Crear paginas legales.
4. Confirmar webhooks contra el dominio final.
5. Pasar Stripe a live.
6. Validar fiscalidad antes de activar Stripe Tax.
7. Hacer compra real controlada con `ORDER_CONFIRM_PRINTFUL=true`.

## Smoke test despues de desplegar

### Nivel 1: lecturas y cotizaciones, sin pedidos ni cobros

1. Relacionar el SHA exacto de `main`, el deployment `Ready` y el alias publico.
   Un preview verde no prueba que el dominio ya sirva el merge.
2. Abrir `/`, `/products` y un PDP real; confirmar HTTP 200, catalogo e imagenes.
3. Cotizar una seleccion real actualmente apta hacia ES: Standard a 0.00 cuando
   sea elegible. Reconsultar evidencia: no fijar una variante como apta para siempre.
4. Probar una seleccion con riesgo conocido y un carrito mixto cuando exista
   evidencia vigente: 409 `EU_CUSTOMS_RISK`, sin ruta de pago disponible.
5. Probar falta de evidencia y respuesta tardia en tests/UI interceptada, no
   provocando fallos del proveedor en produccion. Esperar
   `SHIPPING_CHECK_UNAVAILABLE`/503, conservar direccion e invalidar tarifas.
6. Comprobar US sin dependencia de v2 y CA/GB rechazados con 400. Confirmar
   Standard incluido en destinos aptos y Printful Fast incluido solo para US.
7. Si cambio la UI, revisar movil/escritorio y edicion de direccion/pais/carrito:
   respuestas antiguas no recuperan tarifas ni habilitan pago; copy en ingles.
8. Registrar fecha, SHA, entorno, HTTP/codigo y alcance. No llamar a
   `/api/checkout` ni crear sesiones, pedidos o emails en este nivel.

En el smoke publico posterior a #27 se probaron las tres paginas, una seleccion
apta y otra con riesgo a ES, y el bloqueo CA/GB. Los seis destinos y el carrito
mixto tenian cotizaciones reales locales; los fallos/latencia de la revision
visual eran interceptados. No atribuir todos los casos anteriores a ese smoke.

### Nivel 2: recorrido Stripe test con efectos controlados

Requiere autorizacion para sus efectos y comprobacion del modo test efectivo,
`ORDER_CONFIRM_PRINTFUL=false`, Stripe Tax desactivado y destinatario de prueba.
Los pedidos draft y emails son efectos reales aunque el pago sea test.

1. Crear Checkout test y completar el pago de prueba.
2. Confirmar pedido en Firestore y evento Stripe procesado en `webhookEvents`.
3. Confirmar el mismo ID externo de Printful en estado `draft`, sin fabricacion.
4. Confirmar email en ingles si esta habilitado: distinguir accepted de delivered.
5. Probar expiraciones, concurrencia y reembolsos completos/parciales/pending
   segun el alcance autorizado. Los estados no provocados siguen sin verificar.
6. Probar eventos autenticos Printful solo si pueden provocarse sin fabricacion
   y estan autorizados; un evento simulado no acredita recepcion del proveedor.
7. Identificar borradores, reembolsos y emails antes de cualquier limpieza.
   Reembolsar Stripe no cancela automaticamente Printful.

La compra live/fabricacion es un tercer nivel separado y aplazado por decision
de la persona propietaria. No la ejecutar por seguir esta guia. Una actualizacion
solo documental tampoco requiere repetir el nivel 2.

### Ejecucion controlada posterior a PR #23

Con `main` en `6789b9d`, un Checkout Stripe test completo recorrio el webhook
firmado, Firestore, un pedido Printful `draft` y un job de confirmacion aceptado
por el proveedor de correo. El reembolso completo quedo conciliado en Stripe y
Firestore; un `503` temporal por eventos simultaneos se resolvio al reenviar el
mismo evento y comprobar su estado final `processed`. Una compra test anterior
con una direccion modificada por Stripe se detuvo en `manual_review` antes de
crear pedido remoto o aceptar email. Ese pago test tambien se reembolso. La
pagina de exito respondio `200` sin exponer el ID interno en la URL de retorno.

La prueba consultada fue `livemode=false` y `automatic_tax=false`; el proveedor
confirmo que el pedido permanecio en `draft`. Esa prueba no demostro entrega
del correo en bandeja, evento real del webhook Printful, cancelacion del
borrador reembolsado ni compra live con fabricacion. Posteriormente, el 8 de
octubre se registro un `order_created` autentico de un borrador sintetico
distinto y su cancelacion sin observar el evento `order_canceled`; no confundirlo
con la limpieza del borrador reembolsado anterior. Ver los detalles y
pendientes en [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) y el procedimiento de
diagnostico en [operations.md](operations.md).

## Rollback basico

Si algo falla tras desplegar:

- Revertir al deployment anterior en Vercel.
- Mantener `ORDER_CONFIRM_PRINTFUL=false` mientras se investiga.
- Revisar eventos en Stripe, Printful y Firestore.
- No reintentar pedidos manualmente sin comprobar duplicados por `printfulExternalId`.

## Despliegue de seguridad de pedidos y reembolsos

Estado: los PR #21, #22 y #23 estan integrados en `main` y la prueba Stripe test
anterior verifico el flujo de pago, pedido, borrador y reembolso en el deployment.
El lanzamiento sigue `NO-GO`. El build local y las APIs interceptadas de la fase
de desarrollo no probaban resultados de proveedores; la prueba posterior tampoco
demuestra entrega de correo, fabricacion ni cobros live.

Para futuros cambios en este flujo, conservar estos controles de despliegue:

El drenaje/fencing es una precaucion ante cambios de protocolo o rollback a
workers incompatibles, no una orden de pausar servicios por editar Markdown.
La evidencia de la transicion original permanece por reconciliar en la checklist;
no se acredita retrospectivamente con el despliegue de #27.

1. Ejecutar tests, lint, TypeScript, build y audit sobre el SHA final revisado;
   completar inventario de PRs/ramas/worktrees de AGENTS.md. Resolver o aceptar
   explicitamente advisories pendientes; no usar npm audit fix --force.
2. Preparar rollback y una ventana controlada. Pausar procesamiento/entrada de
   eventos y drenar workers viejos sin fencing antes de habilitar los nuevos.
   No basta esperar 120 segundos si siguen invocaciones antiguas: confirmar que
   ya no pueden iniciar ni completar llamadas externas. Documentar como se
   preservan y reenvian eventos pendientes sin perderlos.
3. Confirmar en Stripe test las ocho suscripciones anteriores, su endpoint y
   firma. Desplegar primero al entorno de prueba revisado con
   ORDER_CONFIRM_PRINTFUL=false; probar pago completo, eventos repetidos y
   concurrentes, reembolsos parciales/pending y reintentos 503 con Retry-After.
4. No ejecutar migracion ni backfill masivo de checkoutValidation, latches o
   emailJobs. Pedidos legacy deben revalidarse individualmente cuando proceda;
   los cumplidos sin job permanecen en revision sin correo historico. Ningun
   script borra bloqueos financieros o estados terminales para habilitar Retry.
5. Confirmar recuperacion del mismo ID Printful, jobs durables y aceptacion
   Resend dentro de 23h. Comprobar entrega/rebotes por separado y revisar
   manual_review/blocked. No existe cron nuevo para reintentos de email.
6. Solo con pruebas y revision completadas, confirmar suscripciones del entorno
   final y el SHA desplegado, retirar la pausa y vigilar webhooks fallidos,
   printful_pending, leases, latches y jobs pendientes. La compra real controlada
   y ORDER_CONFIRM_PRINTFUL=true requieren autorizacion aparte.

Rollback a un worker sin fencing tambien exige parar/drenar los nuevos y revisar
eventos, recibos Printful y emails aceptados antes de reanudar. Cambiar deployment
no revierte dinero, fabricacion ni emails ya aceptados; no borrar esos recibos.
El procedimiento manual y los limites de desbloqueo viven en
[operations.md](operations.md).
