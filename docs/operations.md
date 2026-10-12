# Runbook Operativo

Este documento recoge los pasos practicos que han ido saliendo durante la puesta en marcha. No sustituye al `README.md`; lo complementa para operar la tienda sin tener que reconstruir la conversacion.

## Estado Del Proyecto

- La referencia de estado es [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). El
  roadmap prioriza y este runbook describe procedimientos; no duplicar estados
  de lanzamiento ni interpretar snapshots como lecturas actuales del proveedor.
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

- Destinos activos: `US`, `ES`, `FR`, `DE`, `IT` y `PT`. `CA` y `GB` estan bloqueados temporalmente antes de cotizar o crear checkout, aunque la variable de Vercel aun los contenga.
- `STANDARD`: incluido para el cliente en los seis destinos activos.
- `PRINTFUL_FAST`: incluido solo para destinatarios `US`.
- Otros metodos: mantienen el precio de Printful.

La logica interna conserva la tarifa cotizada para `CA` y `GB` si se habilitan en el futuro, pero ese cargo no prepaga aranceles ni convierte el pedido en DDP. No reabrir esos destinos sin confirmar una tarifa DDP real y su uso efectivo en fulfillment.

Estas reglas se aplican tanto al listar tarifas como al crear checkout. Si Vercel muestra un `400` rapido y sin llamadas externas en `/api/shipping/rates`, revisar primero el contrato de validacion local del carrito.

### Control de elegibilidad UE (integrado y desplegado el 2026-10-11)

PR #27, merge `929a725`, Vercel Production `Ready`. El cierre de despliegue y
las cotizaciones publicas posteriores estan en la
[checklist](LAUNCH_CHECKLIST.md#control-preventivo-aduanero-ue--2026-10-11).
Es una comprobacion previa al pago, no una autorizacion para Stripe live.

El precio de transporte sigue procediendo de v1. En ES/FR/DE/IT/PT se comprueba
ademas v2 por metodo y por paquete, tanto al cotizar como justo antes de crear
Firestore/Stripe. Solo se permite el metodo si cubre el carrito completo,
coincide la moneda y todos los flags aduaneros son explicitamente false.
Esto no es una lista estatica de tallas bloqueadas ni una promesa de DDP.

| Codigo | Significado | Actuacion |
| --- | --- | --- |
| `EU_CUSTOMS_RISK` / 409 | Evidencia completa, al menos un paquete con riesgo | Elegir otra talla/color/producto y recalcular; conservar direccion y carrito |
| `SHIPPING_CHECK_UNAVAILABLE` / 503 | Evidencia ausente/inconsistente, tecnica no soportada o fallo externo | Reintentar mas tarde; investigar contrato, metadatos y disponibilidad si persiste |
| `SHIPPING_OPTIONS_CHANGED` / 409 | Metodo ya no disponible o tarifas vacias | Volver a cotizar y elegir una opcion nueva |

No editar un flag manualmente, sustituir DTF por DTG para conseguir tarifa,
reutilizar una cotizacion anterior ni desactivar el control como bypass.
Una opcion rechazada nunca debe crear pedido interno ni sesion Stripe.
Los logs del fallo de evidencia son deliberadamente genericos, sin tokens,
direcciones ni payloads; diagnosticar con lecturas/cotizaciones acotadas.

La correspondencia real verificada es placement `front_dtf` y tecnica `dtfilm`.
Si se anade otra configuracion de impresion, ampliar contrato y tests antes de
permitirla. El getter tiene 20 segundos globales y como maximo tres lecturas
de metadatos simultaneas; US no depende de este getter.

**Limite posterior al pago:** no se detectan automaticamente cambios de ruta
despues de crear Stripe. Si se conoce un cambio mientras el pedido aun puede
detenerse, revisar con el procedimiento operativo de pedidos existente y
contactar con el cliente cuando proceda. No prometer deteccion total, fabrica
fija, ausencia garantizada de cargos ni cancelacion automatica.

Ver [evidencia de cotizaciones](legal-templates/printful-fulfillment-matrix.md#comprobacion-dinamica-2026-10-11)
y [checklist](LAUNCH_CHECKLIST.md). No hubo pagos ni fabricacion en esta prueba.

**Limitacion conocida:** la muestra crop de catalogo `49803` con su tecnica
DTF no obtuvo evidencia v2 utilizable el 11 de octubre. Se trata como
`SHIPPING_CHECK_UNAVAILABLE`, no como aduanas confirmadas. Consultar de nuevo
la variante/configuracion concreta al investigar; no extrapolar a toda la
prenda ni cambiar tecnica o saltarse el control para desbloquear una venta.

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

### Resultado de la prueba controlada en Stripe test

Tras integrar los PR #21, #22 y #23, se probaron dos recorridos en el dominio
publico con Stripe test y el codigo de `main` en `6789b9d`:

1. Stripe modifico materialmente una direccion introducida antes del pago. El
   webhook dejo el pedido en `manual_review` con `ShippingAddressChanged` y no
   creo pedido Printful ni acepto correo de confirmacion. El pago de prueba se
   reembolso completamente. No pulsar `Retry` para ese pedido sin revisar
   direccion, pago, reembolsos y recibos externos.
2. Con una direccion coincidente, incluida la equivalencia comprobada entre
   el nombre y el codigo de la region, el pago completo genero un pedido
   Firestore validado, un evento `checkout.session.completed` procesado, un
   pedido remoto `draft` y un job de confirmacion `accepted` con ID del
   proveedor de correo. `accepted` no demuestra entrega en bandeja.
3. El segundo pago se reembolso completamente en Stripe test. Firestore quedo
   con `refundSummary.status=full` y el importe completo. El borrador remoto
   persistio: el reembolso no lo cancela. Aunque `fulfillmentBlocked` pueda ser
   `false` cuando ya existe recibo remoto, la actividad de reembolso impide un
   nuevo intento de fulfillment. Localizar y revisar ese borrador antes de
   cualquier limpieza manual.
4. Un `charge.refunded` coincidente con otros eventos recibio temporalmente
   `ProcessingBusyError`/HTTP `503`. Se reenvio el mismo evento de Stripe test;
   `webhookEvents` termino en `processed`, sin crear otro pedido remoto ni otro
   email. Ante un `503`, consultar el estado final antes de declarar fallo o
   reenviar, y conservar la identidad del evento.

La sesion consultada tenia `livemode=false` y `automatic_tax=false`. El estado
`draft` se comprobo directamente en el proveedor. Estas observaciones prueban
el resultado de esas sesiones, no revelan los valores actuales de las variables
en Vercel ni autorizan activar pagos live o fabricacion.

### Comprobaciones adicionales del 8 de octubre de 2026

- Dos sesiones Stripe test sin pagar se expiraron de forma controlada; Firestore
  guardo `expired` para ambos pedidos (`e370c5da31fc4c6daa99903539f45df0`
  y `53371f22e9d14866894f697b6fe71407`). No hubo cargo ni pedido remoto.
- El pedido test `7fa47ac9855e44ae86b531d887df65d1` ya estaba en
  `manual_review` por discrepancia de direccion, sin recibo remoto; la busqueda
  de su ID externo en Printful devolvio 404. Se reembolsaron **500 de 3999**
  centavos USD mediante el refund `re_3UNammRp3VC0CE6j1fftGL8G`.
  Firestore guardo un solo recibo `succeeded`, resumen `partial`, importe 500 y
  `fulfillmentBlocked=true`; el pedido permanecio en revision.
- El evento `refund.updated` `evt_3UNammRp3VC0CE6j15eKxqwN` quedo
  inicialmente `failed` por `ProcessingBusyError` entre eventos simultaneos.
  Tras comprobar que Stripe tenia una entrega pendiente y que el recibo ya
  estaba conciliado, se reenvio **ese mismo ID** al endpoint test. Firestore
  termino `processed` en el tercer intento; el refund count siguio en uno.
- Un borrador sintético Printful `179951879`, con `confirm=0`, emitio un
  webhook autentico `order_created` que Firestore registro `processed` en un
  intento. Ese borrador quedo `canceled`, sin cargo ni fabricacion. No se
  observo un webhook `order_canceled` del borrador, ni se ha probado un evento
  de envio real. El borrador anterior `179691582`, de un pago test ya
  reembolsado por completo, estaba `draft` en esa consulta y no se toco;
  consultar de nuevo su estado antes de cualquier accion.
- Una sesion Stripe test nueva mostro `automatic_tax.enabled=false`. Tambien
  permitia `CA` y `GB` ademas de `US`, `ES`, `FR`, `DE`, `IT` y `PT`. Esta
  observacion precede a #25/#26: ahora Stripe queda limitado al pais cotizado
  y CA/GB se bloquean por codigo. La limpieza de la variable de paises sigue
  pendiente de verificar; ver checklist.
- No se verifico la recepcion en bandeja del email por decision expresa de la
  persona propietaria. `accepted` de Resend no equivale a `delivered`.
- El escenario de refund `pending` esta cubierto por tests sinteticos (63
  pruebas focalizadas aprobadas), no por un refund `pending` real de Stripe.

Los registros de runtime de Vercel no se pudieron leer con el conector (403).
Por ello, la evidencia del webhook real de Printful procede del propio evento
guardado como `processed` en Firestore, no de una linea de log ni de una
captura de respuesta HTTP.

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
En webhooks de pago y reembolso, las lecturas financieras paginadas renuevan y
comprueban ambos propietarios antes y despues de cada lectura acotada. Cada
peticion Stripe mantiene su limite de 20 segundos; la duracion acumulada puede
superar 120 segundos mientras los leases sigan vigentes. No se revive un token
caducado. Si el evento de reembolso ya tiene una asociacion persistida con el
PaymentIntent, toma el pedido y guarda el bloqueo antes de esperar mas lecturas
de Stripe; un fallo o una lista vacia posterior no borran esa observacion.
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

## Alertas operativas: implementacion local desactivada

El 12 de octubre se implemento la funcion en la rama local
`codex/operational-alerts`. No esta publicada, integrada ni activada por este
trabajo. La [evidencia local y puertas de activacion](verification/2026-10-12-operational-alerts.md)
no acredita cron real, aceptacion de Resend ni recepcion en bandeja. La vigilancia
manual de la siguiente seccion sigue vigente y el lanzamiento permanece `NO-GO`.

### Configuracion y cobertura

- `OPERATIONAL_ALERTS_ENABLED` ausente, `false` o distinto de `true` desactiva
  la funcion. Ademas exige `VERCEL_ENV=production`, un unico destinatario privado
  valido en `OPERATIONAL_ALERTS_TO`, `RESEND_FROM_EMAIL` valido y el origen HTTPS
  de `NEXT_PUBLIC_BASE_URL`. No escribir el correo personal ni secretos en git.
  Preview/local quedan desactivados; los tests inyectan una configuracion ficticia.
- `GET /api/operations/digest` exige autenticacion cron/admin antes de Firestore.
  El cron declarado es `0 8 * * *` UTC, horario aproximado, sin ajuste automatico
  a Madrid. Conserva el sync de catalogo a las 03:00 UTC. El plan Vercel vigente,
  la duracion declarada de 60 segundos y la ejecucion real requieren verificacion.
- Se observan pedidos `manual_review`/`failed`, revision de email/reembolso,
  jobs `blocked`/`manual_review`, webhooks con fallo persistido y fallos de sync.
  No se avisa por ocupacion normal, entrada rechazada ni bloqueo preventivo de
  un reembolso correcto. No se reintentan pedidos, cobran importes, reembolsan
  pagos ni confirma fabricacion desde las alertas.
- El aviso inmediato requiere una transicion nueva comprobada, posterior al
  inicio registrado. Las escrituras simples de pedido/catalogo no prueban un
  predecesor atomico: usan `previous='unknown'` y quedan `digest_only`. Lo mismo
  ocurre con incidencias preexistentes, hallazgos diarios y exceso del cupo de
  20 avisos iniciales por hora UTC. Las observaciones transaccionales conservan
  la posibilidad de aviso inmediato; no se anaden transacciones financieras.
- El resumen detecta tambien pedidos `printful_pending` y jobs `pending` con
  mas de 15 minutos, webhooks `processing` con mas de cinco minutos y lease
  vencido, sync correcto de mas de 36 horas y entregas de alertas pendientes de
  revision. Incluye conteos y hasta 20 referencias, no datos del cliente.
- Cada ronda pagina como maximo 1000 documentos presupuestados/examinados en
  30 segundos. Guarda cursores; `partial` y `unchecked` significan cobertura
  incompleta, nunca cero problemas. La cobertura puede abarcar varias rondas;
  ni siquiera un ciclo completo es una instantanea global simultanea.

### Leer el registro y actuar

1. Con acceso administrativo de solo lectura, consultar
   `operationalAlertRuns/day-<AAAA-MM-DD UTC>`: `finishedAtMs` indica fin local
   de ronda y `result` contiene `partial`, `unchecked`, `pendingCount`, `counts`
   y `examined`. `operationalAlertRuns/scan` conserva cursor y lease en curso.
   Si falta la ronda esperada, revisar cron/logs y hacer la ronda manual: la
   ausencia de correo no demuestra salud. Un GET manual no acredita cron.
2. Revisar `operationalAlerts/<id>`: categoria, referencia, `status`, `generation`
   y `needsReconciliation`. Una lectura nueva y valida puede resolverla; la
   ausencia en una pagina o un fallo de lectura no demuestra resolucion.
   Una reaparicion comprobada abre otra generacion. No editar pedidos para
   silenciar alertas ni borrar registros para forzar reenvios.
3. Consultar `deliveries/<generacion>` y, para el resumen,
   `operationalAlertRuns/day-<fecha>/deliveries/summary`. `accepted` con
   `providerEmailId` significa aceptacion, no entrega. `pending`, `processing`,
   `review` y `digest_only` requieren interpretar lease, `firstDispatchAtMs`
   y `outcomeCode`; `digest_only` no equivale a incidencia resuelta.
4. El primer intento congela mensaje, remitente, destinatario y clave. Los
   reintentos conservan esos datos solo dentro de 23 horas desde ese intento;
   despues pasan a revision, sin cambiar clave para reenviar. Ante recibo perdido,
   conciliar en Resend antes de una accion manual. El digest aceptado del dia no
   se reemplaza con hallazgos posteriores; consultar el registro mas reciente.
5. La persona propietaria investiga y decide acciones. Los logs de fallo usan
   solo `operational_observation_failed` / `operational_delivery_failed`.
   Firestore caido puede impedir incluso guardar el aviso. Resend caido deja
   sin ambos correos: no hay segundo canal, detector externo de caida total de
   Vercel ni garantia sobre eventos que nunca llegan. El soporte sigue manual.

### Activar o desactivar: fase separada

Antes de activar: integrar con auditoria AGENTS, revisar seguridad y verificar
indices/transacciones con emulador o entorno realmente aislado, dos workers,
timeout, cron repetido y desactivacion. No usar un Preview con credenciales
compartidas. Confirmar configuracion vigente y autorizar destinatario, sender,
flag y redeploy. La primera observacion guarda `activatedAtMs` en
`operationalAlertRuns/config`; comprobarlo sin provocar fallos en pedidos reales.

La prueba de correo exige autorizacion concreta, etiqueta TEST ONLY y runner
temporal restringido, sin endpoint publico adicional. Registrar recibo y
recepcion por separado, y observar despues una invocacion cron autentica con
repeticion deduplicada. Hasta entonces no existe vigilancia automatica verificada.

Para desactivar, establecer `OPERATIONAL_ALERTS_ENABLED=false` y redesplegar
con autorizacion. Conservar ledger, recibos e historico de activacion; no cambiar
secretos ni datos comerciales. La prueba de esta desactivacion en entorno
aislado sigue pendiente; no equivale al ensayo separado de rollback de la tienda.

## Vigilancia manual del lanzamiento

**Responsables.** La persona propietaria revisa los tableros y el buzon,
decide sobre devoluciones, cancelaciones, reembolsos y pausas de venta, y
ejecuta las acciones financieras. Codex puede ayudar a correlacionar IDs,
analizar eventos y verificar resultados cuando la persona propietaria lo
solicite; no vigila la tienda en segundo plano ni sustituye una guardia humana.
El acceso de soporte a `orders@funnyteesforall.com` debe verificarse antes de
aceptar ventas reales; hoy la recepcion de ese buzon no esta acreditada.

**Cadencia propuesta.** Mientras solo hay pruebas, revisar despues de cada
checkout, refund o cambio de webhook. El dia de apertura y los siete primeros
dias, revisar al menos al inicio, a mitad y al final de la jornada de trabajo
en hora de Madrid; revisar de inmediato tras cualquier alerta de Stripe o
cliente. Despues, dos revisiones por dia laborable si no hay incidencias.
Esta cadencia no da cobertura 24/7 para clientes de Estados Unidos: si se
requiere esa cobertura, designar un suplente y configurar alertas automaticas
antes de prometerla. No hay alertas automaticas operativas verificadas hoy.

**En cada ronda, registrar solo IDs y estados en un ledger privado:**

1. Abrir `/admin` y `Load review orders`; inspeccionar `manual_review`,
   `failed`, `printful_pending`, `fulfillmentBlocked`, `refundReviewReason` y
   `emailReviewReason`. Comparar cada pedido pagado con Stripe, Firestore y
   el ID externo remoto antes de cualquier `Retry`.
2. Revisar `webhookEvents` de Stripe y Printful: `failed` requiere diagnostico;
   `processing` solo es sospechoso si ya vencio su lease. Consultar tambien
   los intentos de entrega del proveedor y el estado final del pedido. Un
   `503 ProcessingBusyError` concurrente no justifica crear otro evento ni
   otro pedido; reenviar el **mismo ID** solo si sigue sin `processed`.
3. Comprobar `emailJobs` bloqueados o en revision y el estado del proveedor de
   correo, distinguiendo aceptacion de entrega. Revisar el buzon de soporte
   verificado para consultas, desistimientos y reclamaciones. Confirmar
   recepcion de cada solicitud en un dia laborable y priorizar problemas de
   pago, direccion o defecto el mismo dia durante la cobertura declarada.
4. Anotar fecha/hora, ID interno, proveedor, estado, responsable, accion
   autorizada y resultado. No copiar PII, direcciones, secretos ni payloads
   completos al repositorio o a tickets compartidos.

**Escalado.** Tratar como urgente un pago live sin pedido local trazable, un
posible duplicado, un reembolso discrepante, un webhook de pago repetidamente
fallido o un pedido que pueda fabricarse con importe/direccion incorrectos.
No pulsar `Retry`, confirmar fabricacion ni emitir otro refund hasta conciliar
IDs y recibos. Si el riesgo afecta a nuevos compradores, la persona
propietaria decide pausar temporalmente checkout y comunicar la incidencia;
el procedimiento de rollback de Vercel se prepara antes del lanzamiento.
Los casos ordinarios de soporte se investigan durante la siguiente ronda; los
fallos repetidos o sin dueño se escalan a la persona propietaria ese mismo dia.

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
