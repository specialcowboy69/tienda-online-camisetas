# Alertas operativas — especificacion aprobada

Fecha: 2026-10-12. Estado: **especificacion aprobada por la persona propietaria**.
El [plan de implementacion](../plans/2026-10-12-operational-alerts.md) esta
aprobado para ejecucion con subagentes y revision independiente. No es una
instruccion de activacion. La implementacion local de este plan tiene su alcance
y pendientes en el [informe de verificacion](../../verification/2026-10-12-operational-alerts.md);
no esta publicada, integrada ni activada por ese trabajo.

## Intencion y decision acordada

Avisar a la persona propietaria cuando la tienda registra una incidencia y
enviar un resumen diario de pendientes. La persona propietaria eligio esta
opcion frente a una comprobacion cada pocos minutos con otro programador o
plan. Se conserva Vercel Hobby, Firestore y Resend; no se contrata otro servicio.
No se reintentan pedidos, cobran importes, emiten reembolsos ni confirman
fabricaciones automaticamente. Codex no queda vigilando en segundo plano.

El destinatario sera el correo controlado acordado en el chat, configurado
mediante `OPERATIONAL_ALERTS_TO` y nunca fijado en codigo, documentacion publica
ni direcciones de clientes. El correo de cliente sigue en ingles. Los avisos
operativos internos pueden redactarse en espanol.

## Alternativas consideradas

1. **Elegida: avisos por incidencia + cron diario.** Reutiliza infraestructura;
   algunos fallos solo se descubriran en la siguiente ronda diaria o manual.
2. Revision cada pocos minutos mediante otro plan/programador. Detectaria antes
   trabajos atascados, pero requiere decidir servicio, coste y nueva superficie
   de credenciales. Fuera de esta primera version.
3. Solo panel y vigilancia humana. Es el estado actual, no satisface el objetivo
   de avisos automaticos. Se mantiene como respaldo de las otras opciones.

## Arquitectura y limites de aislamiento

Tres componentes pequenos:

- **Detector puro:** convierte estados persistidos en incidencias tipadas, sin
  llamadas al proveedor, texto de errores arbitrario ni datos personales.
- **Registro y emisor:** coleccion `operationalAlerts`, con identidad estable,
  deduplicacion, lease y recibo Resend propios. No mezcla avisos internos en
  `emailJobs` de clientes ni modifica su protocolo.
- **Resumen diario protegido:** ruta `GET /api/operations/digest`, autentica con
  el patron actual de cron/admin antes de cualquier lectura. Cron `0 8 * * *`
  UTC; no se promete una hora exacta ni ajuste automatico a horario de Madrid.
  Conserva el cron existente de catalogo a las 03:00 UTC.

Activacion explicita `OPERATIONAL_ALERTS_ENABLED=true`, desactivada por defecto.
El envio solo se permite en Production y con destinatario/remitente validos;
las pruebas locales inyectan transportes. Preview no envia correos operativos
ni consulta una base de datos productiva para probar fallos. No se anade una
via HTTP para que cualquier cliente elija destinatario o texto del aviso.

## Deteccion

Aviso inicial al observar una nueva incidencia persistida:

- Pedido pasa a `manual_review` o `failed`, o aparece `emailReviewReason` o
  `refundReviewReason`; categorizar la razon con una lista cerrada.
- Job de correo de cliente pasa a `blocked` o `manual_review`.
- Webhook con fallo real de procesamiento despues de validar autenticidad;
  excluir 401, payload invalido y `ProcessingBusyError` por concurrencia normal.
- Sincronizacion de catalogo falla.

El detector diario incluye ademas:

- `printful_pending` y jobs `pending` con mas de 15 minutos sin progreso.
- Webhooks `processing` cuyo lease haya vencido y mantengan mas de cinco
  minutos de antiguedad, ademas de los `failed` que sigan sin resolver.
- Ultima sincronizacion correcta del catalogo con mas de 36 horas.
- Alertas cuyo envio fallo o quedo con aceptacion desconocida.

Un reembolso completado o un `fulfillmentBlocked` preventivo sin discrepancia
no es por si solo una incidencia urgente: no alertar indefinidamente por los
pedidos test historicos correctamente reembolsados. Los casos legacy que si
requieren revision se incluyen en el primer resumen como preexistentes, sin
una rafaga de avisos iniciales. La fecha de activacion se registra al habilitar.
No se modifica ni marca resuelto ningun pedido para silenciar una alerta.

## Registro, envio y reintentos

El ID logico deriva de entorno, entidad, tipo y categoria de incidencia. Un
mismo estado repetido no crea otro aviso inicial. Una nueva categoria o una
reaparicion tras resolverse abre una nueva generacion. El contenido se congela
antes de enviar; la clave de idempotencia deriva del ID y generacion.

Campos minimos: tipo, referencia interna, categoria, estado observado,
primera/ultima observacion, generacion, resolucion, payload interno reducido,
estado de entrega, intentos, primer intento, lease y recibo del proveedor.
No almacenar direcciones, nombres, emails de clientes, payloads completos,
secretos ni textos de error sin filtrar. El enlace lleva al panel admin normal,
sin tokens en URL; el panel sigue requiriendo autenticacion.

La escritura de la incidencia se hace despues del resultado de negocio, fuera
de su transaccion. Un fallo de alertas no revierte ni cambia la respuesta de un
webhook, pedido o reembolso. El intento de envio inmediato se programa mediante
`after` de Next.js tras la respuesta; no se usa una promesa suelta como garantia
de ejecucion. Si la invocacion no termina, el registro durable y el resumen
permiten descubrirlo. Firestore caido puede impedir guardar la alerta: registrar
solo un codigo seguro en logs y mantener el procedimiento manual.

El worker reclama por transaccion, mantiene remitente/payload/clave y registra
aceptacion solo cuando Resend devuelve un ID. No se promete entrega exactamente
una vez: una aceptacion remota seguida de perdida del recibo sigue siendo ambigua.
Reutilizar clave dentro de la ventana segura actual de 23 horas; fuera de ella,
pasar a revision, no emitir otro correo inicial con clave distinta. El siguiente
resumen puede mencionar la alerta ambigua como incidencia, sin repetir su envio.

Limitar avisos iniciales a 20 por hora UTC con contador transaccional; los demas
quedan registrados para el resumen. Ese limite no cambia ni descarta eventos de
negocio. El resumen usa clave por fecha UTC y se envia solo si hay pendientes;
una segunda ejecucion no duplica el mensaje ya aceptado. No envios de marketing.

## Consultas, resumen y fallo parcial

Consultas acotadas y paginadas por coleccion/estado, siguiendo patrones de
Firestore existentes. Presupuesto maximo por ronda: 1000 documentos y 30 segundos;
guardar cursores en `operationalAlertRuns` y continuar la siguiente ronda. Un
limite alcanzado se anuncia como **revision parcial**, nunca como cero problemas.
Registrar conteos por categoria, ultimo inicio/exito y errores saneados.

Correo con conteos y hasta 20 referencias internas; sin PII. Una consulta que
falla no cancela los resultados parciales de las demas: el mensaje distingue
areas comprobadas de areas no comprobadas. Una ejecucion sin pendientes registra
su exito pero no envia correo. Resend caido puede impedir tanto avisos como
resumen: no existe un segundo canal en esta version.

Los eventos que nunca llegan a la aplicacion, la caida del propio programador,
la bandeja de soporte y un corte total de Vercel no tienen cobertura automatica
garantizada. La persona propietaria mantiene las rondas del runbook y comprueba
la ultima ejecucion. No presentar esta solucion como vigilancia 24/7.

## Pruebas y criterios de aceptacion

Antes de codigo, plan revisado y ejecucion elegida. Implementacion con TDD:

- Umbrales de antiguedad, categorias, repeticion, resolucion/reaparicion y
  exclusiones de reembolsos correctos y ocupacion normal de leases.
- Dos emisores concurrentes: una reclamacion valida; propietario antiguo no
  puede confirmar un resultado ajeno. Reintento con mismo payload y clave.
- Error Resend, recibo perdido y limite de 23 horas sin duplicado deliberado.
- Fallo del sistema de alertas no altera resultados financieros ni de fulfillment.
- Autenticacion previa a lectura; flag desactivado y Preview sin efectos.
- Cron repetido, paginacion, resultados parciales, cupo de avisos y diario vacio.
- Contenido y enlaces sin PII, secretos ni acciones automaticas sobre pedidos.

Gates de repo: tests completos, lint, TypeScript y build; revision independiente
del cambio relevante e inventario AGENTS antes de PR/merge. No forzar verde si
el lint sigue afectado por helpers locales ajenos. En un entorno separado se
prueban estados sinteticos; nunca se pone un pedido real en error para generar
una alerta. La comprobacion con correo real se dirige solo al destinatario
acordado y se etiqueta TEST ONLY; registrar aceptacion y recepcion separadas.

Activacion tras integrar y revisar configuracion vigente: una alerta inicial
controlada, resumen diario y repeticion sin duplicado; observar la primera
invocacion cron autentica. Hasta entonces la checklist sigue pendiente.

## Reversion

Deshabilitar solo `OPERATIONAL_ALERTS_ENABLED` y redesplegar con autorizacion.
Conservar registros y recibos; no borrar alertas para hacerlas reenviables.
El cron deshabilitado no envia ni cambia pedidos. La reversion de estas alertas
no requiere modificar Stripe, Printful, Firestore comercial ni secretos.

## Trabajos separados encontrados durante la comprobacion

Antecedentes de la comprobacion previa al plan, conservados como historia local
no integrada. No se volvieron a verificar en la implementacion de alertas ni
cierran sus puertas de activacion.

- Corregir el registro de `stock_updated`: resolver Catalog Product IDs,
  preservar la configuracion remota y confirmar un evento posterior genuino.
- Preparar un sandbox realmente aislado para el ensayo de rollback. El preview
  actual comparte metadata de credenciales con Production; no usarlo como si
  fuera una base de datos independiente. La prueba local de tracking no cierra
  el rollback ni la entrega autentica de Printful a Vercel.
- Las capturas del cliente cierran dos recepciones de correo concretas; no el
  canal de soporte ni la recepcion de un email de envio real.

## Referencias consultadas

- [Limites de Cron Jobs de Vercel](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).
- Evidencia local del 12 de octubre sobre webhooks/tracking/operaciones:
  documento no integrado, conservado en el checkout original; no forma parte
  de esta entrega ni acredita comprobaciones remotas de estas alertas.
- [Procedimiento manual actual](../../operations.md#vigilancia-manual-del-lanzamiento).
