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

### Productos Borrados O Ignorados

Firestore conserva productos antiguos para trazabilidad. La tienda publica no debe mostrarlos si tienen `isIgnored: true`.

Hay dos caminos para ocultarlos:

- Webhook `product_deleted`: marca el producto afectado como ignorado.
- Sync completo de catalogo: compara el catalogo actual de Printful con Firestore y marca como ignorados los productos que ya no aparecen en Printful.

Despues de borrar productos en Printful, ejecutar sync desde `/admin` o esperar cron/webhook. Resultado esperado:

- Printful `/store/products`: solo productos activos.
- `/api/catalog`: mismo numero de productos publicos que Printful activo.
- Firestore `products`: puede tener mas documentos, pero los antiguos deben tener `isIgnored: true`.

## Envio

La app pide tarifas reales a Printful, pero aplica reglas de precio al cliente en servidor:

- `STANDARD`: incluido para el cliente en todos los paises permitidos.
- `PRINTFUL_FAST`: incluido solo para destinatarios `US`.
- Otros metodos: mantienen el precio de Printful.

Estas reglas se aplican tanto al listar tarifas como al crear checkout. Si Vercel muestra un `400` rapido y sin llamadas externas en `/api/shipping/rates`, revisar primero el contrato de validacion local del carrito.

## Catalogo E Imagenes

La fuente de verdad operativa sigue siendo Printful + Firestore. Para imagenes publicas, la app permite campos manuales en `products`:

- `storefrontImage`: portada principal.
- `storefrontImages`: galeria manual; la primera imagen actua como fallback prioritario.

Prioridad de imagen visible:

1. `storefrontImage`.
2. Primera `storefrontImages`.
3. Imagen de variante de Printful.
4. Thumbnail de Printful.

La direccion de marca y storefront vive en [`docs/BRAND_STOREFRONT.md`](BRAND_STOREFRONT.md).

### Reintentar Pedidos En Revision

Desde `/admin`, pulsar `Load review orders`. Revisar por separado el estado
operativo, `Payment validation`, motivo de elegibilidad, reembolsos y emails.
`Retry` solo esta habilitado cuando el servidor autoriza fulfillment. Un pago
validado no elimina un bloqueo financiero ni autoriza un estado terminal.

`Revalidate checkout` consulta la sesion Stripe guardada y valida pago completo,
importe, moneda y direccion completa (incluido apartamento y estado). Guarda
evidencia del snapshot y, con el mismo lease, actualiza los reembolsos canonicos.
Puede eliminar una razon transitoria de fallo de lectura financiera despues de
una reconciliacion completa; nunca elimina el bloqueo por actividad de reembolso
ni cambia un estado operativo bloqueado. No fabrica, envia emails ni reembolsa.

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

El ID externo estable se guarda antes de contactar a Printful. Cada recuperacion
busca ese mismo ID antes de crear; un lookup indisponible no autoriza creacion.
Un timeout, fallo de red, 5xx o conflicto puede significar que Printful acepto el
pedido aunque no se guardase el recibo. No cambiar el ID ni crear un reemplazo.
Un pedido remoto cancelado/fallido conserva sus IDs y pasa a revision manual.
`printful_pending` con evidencia valida e ID persistido puede recuperarse; no es
un permiso general para fabricar pedidos sin prueba de pago.

## Stripe

- Configurar el webhook publico en Stripe hacia `/api/webhooks/stripe`.
- Eventos esperados:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
charge.refunded
refund.created
refund.updated
refund.failed
```

Confirmar esas ocho suscripciones primero en Stripe test y, con revision y
autorizacion de despliegue, en el endpoint del entorno correspondiente. La
implementacion local no configura suscripciones. Evitar reenviar eventos de
prueba a produccion mediante `stripe listen`.

### Reembolsos manuales y cancelacion de fabricacion

1. Identificar el pedido, su Checkout/PaymentIntent persistido y el importe
   capturado en Stripe. Consultar pagos, reembolsos y estado Printful actuales.
2. Si se acuerda un reembolso, ejecutarlo manualmente en Stripe Dashboard con
   el importe y moneda correctos. La app no expone un endpoint para crearlo.
3. Comprobar que el webhook se procesa y que Firestore conserva las instantaneas
   en `orders/<id>/refunds` y el resumen canonico. Los importes son unidades
   menores enteras: `500 eur` representa EUR 5.00. `status` none/partial/full
   depende solo de la suma de reembolsos succeeded respecto a amount_received;
   pending/requires_action se cuentan aparte, igual que failed/canceled.
4. Un evento o cualquier actividad observada antes de tener recibo Printful
   deja `fulfillmentBlocked` latched, incluso si luego la lista esta vacia o
   el reembolso falla/se cancela. No usar `Revalidate checkout` para desbloquearlo.
5. Si existe pedido Printful, consultar su estado y gestionar su cancelacion
   manual por separado cuando sea posible. Reembolsar dinero no detiene la
   fabricacion; cancelar fabricacion no devuelve dinero. Documentar ambos
   resultados y verificar con cada proveedor.

No editar flags en Firestore para forzar `Retry`, ni cambiar estado o identidad
para sortear la revision. No existe una accion automatica de resolucion de estos
bloqueos: revisar recibos, asociaciones, historial financiero y estado de
fabricacion, y preparar una resolucion especifica revisada antes de escribir.
Un reembolso desde Dashboard puede competir con una llamada Printful ya iniciada;
el lease local no serializa acciones dentro de los proveedores. Consultar ambos
sistemas y resolver ese caso manualmente, sin promesa de exactamente una llamada.

### Propiedad de procesamiento y HTTP 503

Cada evento y pedido tiene propietario y lease de 120 segundos. La posesion de
un evento no basta para procesar dos eventos distintos del mismo pedido: todos
comparten el lease del pedido, incluidos envios y reconciliacion financiera.
Un propietario caducado no puede persistir recibos ni liberar el lease nuevo.
Un registro legacy malformado se pone en cuarentena durante un lease antes de
recuperarse. HTTP 503 con `Retry-After` significa ocupado/perdida de propietario
o recuperacion de email pendiente; respetar el plazo y reintentar el mismo evento
o accion, sin cambiar identidad. HTTP 409 con razon de elegibilidad requiere
revalidacion o revision; no es un fallo transitorio para reintentar sin inspeccion.

## Resend

### Dominio Remitente

1. En Resend, anadir y verificar el dominio.
2. Si usas Cloudflare DNS, la configuracion automatica de Resend es suficiente cuando todos los registros aparecen verificados.
3. En Vercel, configurar:

```text
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=No Context Club <orders@tu-dominio.com>
```

Resend permite enviar desde una direccion del dominio verificado, pero no crea automaticamente una bandeja de entrada. Si quieres recibir respuestas en `orders@tu-dominio.com`, crea ese buzon o alias en tu proveedor de correo.

### Emails Que Envia La App

- Confirmacion de pedido cuando Stripe pago y Printful acepto el pedido.
- Envio con tracking cuando Printful manda `package_shipped`.

La app guarda un job durable por confirmacion/envio junto al resultado operativo
en una transaccion. Si falta configuracion, el job queda `blocked`, sin empezar
el reloj de envio. El pedido Printful aceptado no vuelve a failed por un email.

`Retry emails only` procesa los jobs existentes sin fabricar ni crear emails
historicos. Revisa cada resultado; puede haber accepted y retry a la vez, con
HTTP 503 y actualizacion de la lista. `Provider accepted` significa que Resend
devolvio un ID: no prueba entrega en bandeja, lectura ni ausencia de rebote.

El mensaje, remitente y clave de idempotencia quedan congelados al primer envio.
Los reintentos usan esa misma identidad. Desde 23 horas despues de ese primer
intento (no desde la creacion), una aceptacion desconocida pasa a `manual_review`
y no vuelve a enviarse automaticamente. No rotar la clave ni clonar el job para
sortear el limite; investigar el recibo en Resend. Los jobs accepted no se envian
otra vez. No hay scheduler de reintentos de email en esta implementacion: usar
replay de webhook o recuperacion admin dentro de la ventana segura.

Pedidos ya cumplidos legacy sin job y confirmaciones faltantes quedan visibles
para revision, sin backfill ni spam historico. Solo una primera fabricacion
actual validada crea su job y enrolla individualmente emailPolicyVersion 1.

## Firestore

Colecciones principales:

- `products`: catalogo sincronizado desde Printful; puede conservar historico con `isIgnored`.
- `orders`: pedidos internos y estados de Stripe/Printful.
- `webhookEvents`: idempotencia y trazabilidad de eventos.
- `syncRuns`: historico de sincronizaciones.
- `emailJobs`: mensajes durables y aceptacion de Resend, con lease propio.
- `orders/<id>/refunds`: instantaneas canonicas de reembolsos Stripe.

Para diagnosticar un pedido:

1. Abrir `orders/<orderId>`.
2. Revisar `status`, `printfulOrderId`, `printfulExternalId`, `printfulStatus`.
3. Si hay fallo, revisar `error.status` y `error.details`.

Tratar registros de pedidos/jobs/payloads como sensibles: contienen informacion
necesaria de destinatario. No copiar direcciones, cuerpos de email, tokens ni
respuestas arbitrarias de proveedores a logs, capturas o tickets. Los nuevos
diagnosticos de email y lectura de reembolsos son genericos; los registros y
errores operativos existentes requieren acceso restringido.

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
