# Verificacion de lanzamiento — 11 de octubre de 2026

> Evidencia historica: conserva los resultados y pendientes de esa ejecucion.
> Estado actual en [LAUNCH_CHECKLIST.md](../LAUNCH_CHECKLIST.md). El mismo 12 de
> octubre se integraron las alertas desactivadas (#29), se corrigio el registro
> de stock (#31) y se verifico [product_updated y restauracion](2026-10-12-product-updated-live.md).
> Las [capturas de Gmail](2026-10-12-webhooks-tracking-operations.md#correo-recibido-evidencia-aportada-por-la-persona-propietaria)
> acreditan despues la recepcion de los dos mensajes del dia 11.


## Alcance y limites

Prueba autorizada sobre `https://www.funnyteesforall.com`, Vercel Production
`dpl_BxnBcM8pj5nUbxXbEZiJz6xQBWVP`, SHA
`6c963d08870bb0d24a949d131b68ff0b87c2aa66` (PR #28 documental; conserva el
codigo funcional de #27). Deployment `Ready` comprobado mediante Vercel CLI.

Stripe permanecio en **test**. La persona propietaria confirmo
`ORDER_CONFIRM_PRINTFUL=false` y `STRIPE_TAX_ENABLED=false` en el deployment
vigente. Ademas, la sesion real devolvio `livemode=false`, Tax desactivado y
Printful devolvio `draft` sin envios. No se activo fabricacion ni hubo dinero
real, cambio de configuracion productiva, rotacion de secretos o modificacion
del catalogo. Los pedidos, emails y cancelaciones remotas si fueron efectos
reales y acotados de esta prueba. Horas de este documento en UTC.

El export temporal autorizado de Vercel oculto los secretos como `[SENSITIVE]`;
no sirvio para leerlos ni confirmar los flags. Las consultas privadas usaron
las credenciales locales existentes. No se registran valores, direcciones,
correo receptor ni payloads completos. El export y los cuatro helpers
temporales se eliminaron al cerrar la comprobacion y se verifico su ausencia;
`.env.local` se conserva intacto.

## Nueva compra test posterior al control de envios UE

Recorrido real de navegador: PDP Falling apart, Black S, variante
`5489215132`, cotizacion ES, STANDARD incluido (0.00), revalidacion al iniciar
checkout, Stripe test y retorno a `/success`.

| Evidencia | Resultado |
| --- | --- |
| Pedido interno | `8fa67dcc34754f109508d0fb54b45d36` |
| Checkout | `cs_test_b1BbnZwJ0utUlksKu22mLukOEEcyHl3BpXMTjX6w6UltA4b6obhUQRENma` |
| Pago | USD 39.99, `complete`, `paid`, `livemode=false` |
| Impuestos y destino | `automatic_tax.enabled=false`; `allowed_countries=[ES]` |
| Validacion | `checkoutValidation` presente y elegibilidad administrativa reconoce validacion valida |
| Evento de pago | `evt_1UPS4fRp3VC0CE6jRTlga3v8`, `processed`, 1 intento |
| Printful | `180436734`, mismo ID externo, `draft`, 0 envios antes de la limpieza |
| Evento autentico Printful | `printful:order_created:1791745598:18536834:8fa67dcc34754f109508d0fb54b45d36`, `processed`, 1 intento |
| Confirmacion original | Job `75ccfdbfeae78892881d726e8e1d46cdfedf5d68308ba015c32663a5893c91cb`, `accepted`, 1 intento, ID de proveedor presente |
| Retorno | `/success` visible en movil; URL sin ID interno del pedido |

Esto comprueba una seleccion apta a ES, no todas las variantes/destinos ni un
carrito mixto. No se repitio aqui un pago live ni la prueba de reembolso parcial
del 8 de octubre. `accepted` no acredita entrega en bandeja, que sigue aplazada.

## Reembolso autentico pendiente y completado

Se utilizo la tarjeta de prueba documentada por Stripe para
[reembolsos asincronos](https://docs.stripe.com/testing#refunds), sin tarjeta real.
Un unico refund, con identidad estable:

- PaymentIntent `pi_3UPS4dRp3VC0CE6j0QAWQ7xn`.
- Refund `re_3UPS4dRp3VC0CE6j03PC01Sj`, 3999 centavos USD.
- A las 19:08:04 Stripe respondio `pending`.
- A las 19:09:51 Firestore tenia `refundCount=1`, `pendingCount=1`,
  `refundedAmount=0`, `status=none`: no confundio pendiente con completado.
- A las 19:13:55 Stripe devolvia `succeeded` y Firestore `status=full`,
  `refundedAmount=3999`, `pendingCount=0`, `refundCount=1`.
- Comprobacion final a las 19:24:52: un solo refund, completo.

Los eventos `refund.created` (`evt_3UPS4dRp3VC0CE6j0R3AUEF0`),
`charge.refunded` (`evt_3UPS4dRp3VC0CE6j0BKklTMV`) y los dos
`refund.updated` (`evt_3UPS4dRp3VC0CE6j0h9QfJOc`,
`evt_3UPS4dRp3VC0CE6j0hywicGw`) quedaron `processed`. `charge.refunded`
registro dos intentos; no se hizo replay manual en esta prueba.

El resumen conserva `fulfillmentBlocked=false` porque ya existia recibo
remoto. No significa que Retry este permitido: el endpoint admin devolvio
`allowed=false`, `RefundReviewRequired`. No se modificaron latches ni estados.

## Recuperacion de email: fallo local simulado, reintento remoto real

Se creo un **job de prueba separado** en el pedido nuevo, con asunto y cuerpo
en ingles que lo identificaban como TEST ONLY y sin nueva compra ni envio.
No se reinicio ni altero la confirmacion original.

1. A las 19:11:34, el servicio real `processEmailJob`, usando Firestore real
   pero transporte Resend simulado localmente con HTTP 503, guardo `pending`,
   intento 1, sin ID del proveedor.
2. A las 19:11:36, `POST /api/admin/orders/<id>/retry-email` en Vercel,
   autenticado, devolvio 200. Resend acepto el job en el intento 2 con ID.
3. Se conservaron payload e idempotency key congelados. Una segunda llamada
   al endpoint mantuvo intento 2 y el mismo ID: no reenvio el job aceptado.
4. La confirmacion original siguio `accepted`, intento 1.

Job de recuperacion:
`a3a0874ef35e7c45231f1806e732daff9ac07cc1b81065f11c2271e2b66afadf`.
Esto **no es una caida real provocada en Resend**, ni prueba una aceptacion
perdida por timeout, el cutoff de 23 horas o entrega en bandeja. No se cambio
el transporte ni las variables del deployment para forzar el fallo.

## Limpieza remota autorizada

Tras confirmar reembolso completo test, correspondencia de IDs, estado draft
y ausencia de envios, la persona propietaria autorizo cancelar ambos borradores.
La cancelacion v1 `DELETE /orders/{id}` respondio 200 y una consulta posterior
confirmo `canceled` para cada uno:

| Borrador | Pedido interno | Cancelacion comprobada |
| --- | --- | --- |
| `179691582` | `4bdf700f49af4a8ba54d409b8696aa96` | 19:17:52, canceled, 0 envios |
| `180436734` | `8fa67dcc34754f109508d0fb54b45d36` | 19:17:54, canceled, 0 envios |

Se conservaron pedidos, pagos, recibos de reembolso y emailJobs. No se borro
ningun documento Firestore. No se observo `order_canceled` en los eventos
consultados; Printful documenta ese evento para pedidos confirmados, no como
garantia para un borrador. No confirmar fabricacion solo para provocar el evento.
Ver [cancelacion v1](https://developers.printful.com/docs/#operation/cancelOrderById).

El snapshot local del pedido nuevo aun decia `printfulStatus=draft`; el remoto
era `canceled`. Es una discrepancia operativa documentada, no una cancelacion
sincronizada automaticamente. No editar el snapshot ni reintentar fulfillment
para ocultarla. Ambos pedidos quedan excluidos de reenvio por sus reembolsos.

## Webhooks y ronda de supervision

Lectura de configuracion, sin cambios:

- Stripe test: endpoint `we_1TzJNhRp3VC0CE6je7M5gqRy`, enabled, dominio correcto,
  ocho suscripciones esperadas presentes. No acredita configuracion live ni
  haber provocado cada uno de los ocho tipos.
- Printful: dominio correcto, nueve tipos presentes: `package_shipped`,
  `package_returned`, `order_created`, `order_canceled`, `order_put_hold`,
  `order_remove_hold`, `stock_updated`, `product_updated`, `product_deleted`.
- Muestra final de `webhookEvents`, ordenada por `updatedAt`, limite 150:
  101 registros, todos `processed`. No equivale a vigilancia continua.
- Tres emailJobs, todos `accepted`; ninguno pendiente en esa consulta.
- Hay 44 `product_updated` y 10 `product_deleted` historicos; los mas recientes
  son del **8 de septiembre**, anteriores al codigo actual. No cierran la
  prueba nueva de catalogo. Sin `stock_updated`, `package_shipped` ni
  `order_canceled` en la muestra. No se altero stock/precio/productos reales.

El endpoint admin devolvio 200 y cinco pedidos en revision:

| Pedido | Estado local | Motivo que impide Retry |
| --- | --- | --- |
| `8fa67dcc34754f109508d0fb54b45d36` | printful_confirmed | RefundReviewRequired |
| `7fa47ac9855e44ae86b531d887df65d1` | manual_review | RefundReviewRequired |
| `4bdf700f49af4a8ba54d409b8696aa96` | printful_confirmed | RefundReviewRequired |
| `d7a85aef8eb84157b4285bae414200d1` | manual_review | RefundReviewRequired |
| `6b15969289b24dcfa01ac01eccb70ecb` | manual_review | CheckoutValidationRequired |

No se revalidaron ni reintentaron esos pedidos legacy. Conservar la ronda
manual de [operations.md](../operations.md#vigilancia-manual-del-lanzamiento):
revisar tras cada prueba y tres veces al dia al abrir, correlacionar recibos
antes de actuar y escalar al propietario. No hay alerta automatica nueva ni
guardia de Codex en segundo plano. La bandeja de soporte sigue sin verificar.

## Dominio, visual y accesos

- HTTP en ambos hosts redirige 308 a HTTPS; apex HTTPS redirige 308 a
  `https://www.funnyteesforall.com/`. Home, productos y cancel devuelven 200.
- El valor publico exportado de `NEXT_PUBLIC_BASE_URL` usa ese canonico; los
  URLs success/cancel de la sesion nueva tambien, sin ID de pedido.
- Revision visual Chromium en 1440x900 y 390x844: home, `/products`, una
  muestra del PDP/checkout y `/cancel`. Sin desbordamiento horizontal en las
  vistas medidas ni imagen rota entre las cargadas inspeccionadas. Success
  verificado en movil tras el pago. No es una auditoria exhaustiva de todos
  los PDP, accesibilidad, rendimiento, Safari o Firefox.
- Sin credenciales: admin orders, retry-email, retry-printful,
  revalidate-checkout, configuracion webhook y catalog sync devolvieron 401.
  Stripe webhook sin firma 400; Printful sin secreto 401. No prueba todos
  los vectores de autorizacion ni rate limiting distribuido.

## Verificacion local y seguridad

- `npm.cmd test`: 477/477, 37 archivos, exit 0.
- TypeScript con `--noEmit --incremental false`: exit 0.
- `npm.cmd run build`: exit 0, Next 15.5.26.
- `npm.cmd run lint`: falla por imports CommonJS de helpers ignorados en
  `.superpowers/`; incluye dos scripts preexistentes conservados. No se
  modifica el lint para ocultarlos. Tras retirar los helpers de esta prueba,
  siguen cuatro errores en `eu-quotes.cjs` y `eu-risk-contract.cjs`.
  ESLint excluyendo solo `.superpowers/**` pasa. El comando obligatorio sin
  exclusion no se declara verde.
- Audit productivo: 9 paquetes (0 critical, 5 high, 4 moderate), exit 1.
  Completo: 22 (2 critical, 13 high, 7 moderate), exit 1.
- Triage estatico Vitest/Tinypool: no se encontro un camino de explotacion
  desde la aplicacion desplegada; versiones afectadas siguen instaladas.
  Ver [SECURITY.md](../SECURITY.md). No hubo upgrade ni aceptacion adicional.
- Escaneo heuristico de 141 archivos versionados y cambios del historial Git
  alcanzable: sin coincidencias de los patrones o secretos locales buscados.
  No es una garantia para todos los formatos, logs o copias externas.

## Rollback preparado, no ejecutado

Candidato anterior comprobado `Ready`:
`dpl_CrSpQJxUieUtBRcGF1JTGyAXFCU6`, SHA
`929a72583cca395cc1027a503dae2c9f4ed502f9` (#27). #28 es documental;
ambos conservan el mismo protocolo operativo y codigo funcional.

Antes de usarlo, volver a comprobar alias, disponibilidad y compatibilidad
actual, obtener permiso para el cambio productivo y seguir
[DEPLOYMENT.md](../DEPLOYMENT.md#rollback-basico). El rollback no revierte
pagos, emails ni pedidos remotos. No se ejecuto rollback, pausa, drenaje ni
prueba destructiva de recuperacion; la transicion historica de workers sigue
sin acreditarse aqui.

## Pendientes que esta prueba no cierra

- Evento nuevo de producto/stock y envio/tracking autenticos; cancelacion de
  pedido confirmado si se autoriza una prueba apropiada, nunca fabricar por probar.
- Aceptacion de email con respuesta perdida, cutoff/legacy y entrega/rebotes.
- Remediacion o decision especifica sobre los criticos de desarrollo.
- Cobertura visual completa y otros navegadores; canal real de soporte y
  alertas automaticas; ensayo de rollback y evidencia historica de transicion.
- Legales y demas requisitos de GO de la checklist. Compra live y trabajo
  fiscal permanecen aplazados, no se ejecutan por esta verificacion.

El estado global sigue **NO-GO para pagos reales**.
