# Operational Alerts Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar incidencias de la tienda y avisar por email, con deduplicacion y un resumen diario de pendientes, sin intervenir en pedidos.

**Architecture:** Detector puro, registro durable independiente y worker de email sobre el transporte Resend existente. Observadores despues de escrituras confirmadas y una ruta cron autenticada alimentan el mismo registro; los fallos de observacion nunca cambian el resultado comercial. La activacion remota es una fase posterior, no un efecto de ejecutar tests o integrar codigo.

**Tech Stack:** Next.js App Router/`after`, TypeScript, firebase-admin/Firestore, Resend mediante `src/lib/email.ts`, Vitest y Vercel Hobby. Sin dependencias nuevas.

**Spec:** [Especificacion aprobada el 12 de octubre](../../../superpowers/specs/2026-10-12-operational-alerts-design.md).

**Estado:** Plan escrito y autorrevisado el 2026-10-12; pendiente de revision del propietario y eleccion de metodo de ejecucion. Ninguna tarea de implementacion realizada por este documento.

## Global Constraints

- `OPERATIONAL_ALERTS_ENABLED=true` es la unica activacion; ausente o cualquier otro valor significa desactivado. `OPERATIONAL_ALERTS_TO` se configura, nunca se fija el correo personal en codigo/docs.
- Produccion: `VERCEL_ENV=production`, destinatario y remitente validos; Preview/local sin lecturas operativas ni envios reales. Tests mediante dependencias inyectadas, no credenciales comerciales.
- Colecciones propias `operationalAlerts` y `operationalAlertRuns`; no introducir avisos internos en `emailJobs`.
- `GET /api/operations/digest`, autenticacion cron/admin antes de leer Firestore; cron `0 8 * * *` UTC. Conservar `/api/catalog/sync` y `0 3 * * *`.
- Umbrales: mas de 15 minutos para pedido/job pendiente; mas de cinco minutos y lease vencido para webhook en procesamiento; mas de 36 horas sin sync correcto.
- Idempotencia segura 23 horas (`82800000` ms); maximo 20 avisos iniciales por hora UTC; maximo 20 referencias por resumen.
- Ronda acotada: 1000 documentos examinados y 30 segundos; paginacion durable, resultado parcial explicito, ninguna resolucion basada solo en ausencia de una pagina.
- Ningun reintento de pedido, cobro, reembolso, confirmacion de fabricacion ni cambio de catalogo provocado por alertas. Mantener `STRIPE_TAX_ENABLED=false`, el bloqueo CA/GB y `NO-GO`.
- No PII de clientes, payloads de proveedores, secretos ni mensajes arbitrarios de excepciones en alertas/logs. Enlaces al panel normal, sin tokens; avisos internos pueden ser en espanol.
- Preservar trabajo ajeno y auditoria AGENTS antes de PR/merge. No activar cron/env remoto, enviar email real, publicar PR o mergear sin la autorizacion correspondiente.
- Stock/productos, seguimiento autentico y sandbox de rollback son trabajos separados. Este plan no los declara completados.

## Review Focus

1. Pedido test reembolsado con bloqueo preventivo, frente a una discrepancia de reembolso real: no silenciar la segunda ni generar una tormenta por el primero (tarea 1).
2. Firestore repite una transaccion o termina un worker con lease antiguo: nunca enviar dentro de la transaccion ni guardar recibos ajenos (tareas 2 y 3).
3. Resend acepta, se pierde el recibo y cambia la configuracion: conservar destinatario, remitente, cuerpo y clave originales; a las 23 horas revision, no reenvio con otra clave (tarea 3).
4. Cursores parciales, documentos que cambian de estado, timestamps legacy o fallo de una consulta: no anunciar cero incidencias ni resolver por omision (tarea 4).
5. Preview comparte credenciales o `after`/el registro falla: cero efectos en Preview y mismo resultado del pedido/webhook; sin promesa de vigilancia continua (tareas 1, 5 y 6).

---

## Preparacion de la ejecucion

- [ ] Leer AGENTS.md, la especificacion y `docs/LAUNCH_CHECKLIST.md`; revisar el diff local antes de tocar codigo. Base observada: `6c963d0`, rama documental `codex/launch-verification-20261011`, spec en `35c2cd2`. Revalidar, no asumir referencias actuales.
- [ ] Usar `using-git-worktrees` para elegir un checkout aislado `codex/operational-alerts`, sin copiar `.env.local`. Llevar solo esta especificacion/plan aprobados al checkout; no arrastrar todos los documentos locales de la rama original. No reutilizar un worktree con documentos ajenos ni borrarlos. Instalar desde su lockfile con `npm.cmd ci`.
- [ ] Registrar baseline de tests/lint/TypeScript/build. Los helpers ignorados `.superpowers/**` del checkout principal tienen fallos de lint conocidos: preservar y separar ese resultado del checkout aislado; no cambiar eslint para ocultarlos.

## Mapa de archivos

Crear bajo `src/lib/operational-alerts/`:

| Archivo | Responsabilidad |
| --- | --- |
| `types.ts`, `config.ts` | Contratos cerrados y puerta de activacion sin I/O |
| `detect.ts` | Proyeccion segura, normalizacion temporal y clasificacion |
| `store.ts` | Generaciones, transacciones, leases, recibos, cupo y checkpoints |
| `render.ts`, `dispatch.ts` | Mensaje interno congelado y envio recuperable |
| `scan.ts`, `digest.ts` | Lecturas acotadas, reconciliacion y resumen UTC |
| `observe.ts` | Observacion tolerante a fallos y planificacion mediante `after` |
| `detect.test.ts`, `store.test.ts`, `dispatch.test.ts`, `scan.test.ts`, `observe.test.ts`, `route.test.ts` | Tests de cada frontera |
| `test-support.ts` | Fixtures sinteticas y adaptador transaccional en memoria, solo importado desde tests |

Modificar `src/lib/env.ts`, `.env.example`, `package.json` (script test con lista explicita), `src/lib/firestore.ts` (observacion poscommit), `src/lib/firestore.test.ts` (regresiones) y `vercel.json`. Crear `src/app/api/operations/digest/route.ts`. Documentar en `docs/operations.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/SECURITY.md` y `docs/verification/2026-10-12-operational-alerts.md`.

Reutilizar sin cambiar su protocolo: `src/lib/firebase-admin.ts:getDb`, `src/lib/auth.ts:isCronOrAdminRequest`, `src/lib/email.ts:sendEmail`, tipos `EmailMessage`/`EmailSendResult`. No refactorizar Stripe, Printful, refunds ni la cola de cliente.

## Tarea 1: Contratos, puerta de activacion y detector puro

**Files:** Crear `types.ts`, `config.ts`, `detect.ts`, `detect.test.ts`, `test-support.ts` en el directorio indicado. Modificar `src/lib/env.ts`, `.env.example`, `package.json`.

**Interfaces:**
- Produce `AlertConfig = { enabled: boolean; environment: string; recipient?: string; sender?: string; siteUrl: string }`; `readAlertConfig(): AlertConfig`; `canRunAlerts(config: AlertConfig): boolean`.
- Produce `SourceRef = { kind: 'order' | 'email' | 'webhook' | 'catalog'; id: string }`, `SourceProjection` (union discriminada por `kind`, solo estado, codigos cerrados, flags de revision y tiempos numericos), `projectSource(ref: SourceRef, raw: unknown): SourceProjection`.
- Produce `Incident = { ref: SourceRef; category: AlertCategory; observedAtMs: number; sourceVersionMs: number | null; trigger: 'immediate' | 'daily' }`, `detectIncidents(source: SourceProjection, nowMs: number): Incident[]`.
- `AlertCategory`: `order_review`, `order_failed`, `email_review`, `refund_review`, `email_blocked`, `email_manual_review`, `webhook_failed`, `catalog_failed`, `order_stale`, `email_stale`, `webhook_stale`, `catalog_stale`, `source_unreadable`, `alert_delivery_review`.
- Produce `Observation = { source: SourceProjection; previous: SourceProjection | null | 'unknown'; mode: 'event' | 'daily'; observedAtMs: number }`. `null` significa creacion acreditada; `unknown` no demuestra transicion nueva.

- [ ] Escribir tests de cada categoria/umbral y de la puerta de configuracion; usar reloj fijo y datos sinteticos:
  ```ts
  expect(detectIncidents(pendingAt(t0), t0 + 900000)).toEqual([]);
  expect(detectIncidents(pendingAt(t0), t0 + 900001)[0].category).toBe('order_stale');
  expect(detectIncidents(refundedWithPreventiveHold(), now)).toEqual([]);
  expect(detectIncidents(refundedWithReviewReason(), now).map(x => x.category)).toContain('refund_review');
  expect(canRunAlerts({ ...validConfig, environment: 'preview' })).toBe(false);
  ```
  Anadir 5 min/36 h exactos y +1 ms, lease vigente, `ProcessingBusyError`, transaccion malformada en cuarentena, ISO/Timestamp e instantes ausentes/invalidos. Un instante desconocido es `source_unreadable`, no salud ni antiguedad inventada. No suprimir una discrepancia por estar reembolsado.
- [ ] Ejecutar `npx.cmd vitest run src/lib/operational-alerts/detect.test.ts`; esperar rojo por contratos inexistentes o asercion de comportamiento, no por credenciales.
- [ ] Implementar las firmas indicadas. Leer flags como strings opcionales; configuracion invalida desactiva solo alertas, no rompe el arranque de la tienda. Validar email unico, remitente actual y URL HTTPS de produccion; no guardar el destinatario en proyecciones. Mapear errores desconocidos a categoria generica, nunca `message/details`. Agregar tests nuevos a `npm test` sin quitar los existentes.
- [ ] Repetir el comando, esperar verde; comprobar que proyeccion/serializacion no contienen nombre, direccion, correo, tokens o payload de fixtures.
- [ ] Commit:
  ```powershell
  git add -- src/lib/operational-alerts/types.ts src/lib/operational-alerts/config.ts src/lib/operational-alerts/detect.ts src/lib/operational-alerts/detect.test.ts src/lib/operational-alerts/test-support.ts src/lib/env.ts .env.example package.json
  git commit -m "feat: define safe operational incident detection"
  ```

## Tarea 2: Registro durable y propiedad de entregas

**Files:** Crear `store.ts`, `store.test.ts`; ampliar `types.ts` y `test-support.ts`; actualizar `package.json`.

**Interfaces:**
- Consume `Observation`, `Incident`, `AlertConfig`, `detectIncidents` y `getDb()`; tests inyectan Firestore y reloj.
- Produce `AlertStore` con `recordObservation(input: Observation): Promise<string[]>` (IDs de entregas elegibles), `claimDelivery(id: string): Promise<DeliveryClaim>`, `prepareDelivery(id: string, token: string, message: EmailMessage): Promise<PreparedDelivery | null>`, `finishDelivery(id: string, token: string, outcome: DeliveryOutcome): Promise<boolean>`.
- `DeliveryClaim = { kind: 'claimed'; token: string; delivery: AlertDelivery } | { kind: 'skip'; reason: 'busy' | 'accepted' | 'review' | 'missing' | 'digest_only' }`.
- `DeliveryOutcome = { kind: 'accepted'; providerEmailId: string } | { kind: 'retry' | 'review'; code: 'transport_failed' | 'configuration_missing' | 'window_expired' | 'receipt_unknown' }`; `PreparedDelivery = { message: EmailMessage; idempotencyKey: string }`.
- `AlertDelivery` contiene ID, kind `incident|digest`, snapshot seguro, estado, lease, intentos, `firstDispatchAtMs`, mensaje congelado y recibo opcionales. Produce `createAlertStore(db: Firestore, now: () => number): AlertStore`.

- [ ] Escribir tests de generacion, activacion, cupo y fencing:
  ```ts
  expect(await recordSameIncidentTwice()).toHaveLength(1);
  expect(await resolveThenReopen()).toMatchObject({ generation: 2 });
  expect(await oldWorkerFinish()).toBe(false);
  expect(await initialRecipientsInSameUtcHour(21)).toBe(20);
  expect(await firstScanOfLegacyFailures()).toMatchObject({ immediate: 0, digest: 3 });
  ```
  Incluir dos claims simultaneos, callbacks transaccionales repetidos, observacion antigua tras una resolucion mas nueva, categoria nueva y timestamp desconocido. Ningun correo desde un callback transaccional.
- [ ] Ejecutar `npx.cmd vitest run src/lib/operational-alerts/store.test.ts`; esperar rojo.
- [ ] Implementar registro con ID hash de entorno/ref/categoria y generacion transaccional. Conservar historial en `operationalAlerts/{logicalId}/deliveries/{generation}`; estado activo/resuelto en el padre. No reutilizar ni borrar recibos de generaciones anteriores.
- [ ] Guardar una sola `activatedAtMs` en `operationalAlertRuns/config`. Incidencias preexistentes, transicion desconocida o observacion diaria: solo resumen. Una transicion acreditada posterior abre aviso inmediato; reevaluaciones del mismo estado no lo hacen. Ignorar versiones antiguas; si el orden no puede acreditarse, mantener pendiente de reconciliacion, nunca resolver a ciegas.
- [ ] Implementar claims de 120000 ms y fencing en prepare/finish. La preparacion congela mensaje/clave/primer intento antes de HTTP. Cupo `operationalAlertRuns/hour-<UTC>` transaccional al primer despacho, maximo 20; retries de la misma entrega no consumen otro cupo. Excedentes quedan `digest_only`, no forman una rafaga diferida. Transacciones con maximo tres intentos.
- [ ] Ejecutar tests del directorio; esperar verde y verificar que escrituras solo afectan las dos colecciones nuevas/subcolecciones.
- [ ] Commit:
  ```powershell
  git add -- src/lib/operational-alerts/store.ts src/lib/operational-alerts/store.test.ts src/lib/operational-alerts/types.ts src/lib/operational-alerts/test-support.ts package.json
  git commit -m "feat: persist deduplicated operational alerts"
  ```

## Tarea 3: Mensajes internos y envio recuperable

**Files:** Crear `render.ts`, `dispatch.ts`, `dispatch.test.ts`; ampliar tipos/test-support; actualizar `package.json`.

**Interfaces:**
- Consume `AlertStore`, `AlertDelivery`, `AlertConfig` y transporte existente `(message: EmailMessage, idempotencyKey: string) => Promise<EmailSendResult>`.
- Produce `renderOperationalMessage(delivery: AlertDelivery, config: AlertConfig): EmailMessage` y `dispatchAlert(id: string, deps: { store: AlertStore; config: AlertConfig; send: typeof sendEmail; now: () => number }): Promise<'accepted' | 'retry' | 'review' | 'skipped'>`.

- [ ] Tests con transporte espia y fallo de persistencia despues de aceptacion:
  ```ts
  expect(secondCall.message).toEqual(firstCall.message);
  expect(secondCall.key).toBe(firstCall.key);
  expect(await dispatchAt(firstDispatch + 82800000)).toBe('review');
  expect(sendAfterWindow).not.toHaveBeenCalled();
  expect(renderedHtml).not.toContain('x-admin-secret');
  ```
  Cubrir cambio de destinatario/remitente entre intentos, ID de proveedor ausente, 503, timeout ambiguo, lease perdido, transporte bloqueado y flag desactivado antes de enviar. HTML escape y URL al panel sin tokens; no enlazar acciones Retry.
- [ ] Ejecutar `npx.cmd vitest run src/lib/operational-alerts/dispatch.test.ts`; esperar rojo.
- [ ] Implementar render de asunto, categoria, referencias internas y enlace fijo `${siteUrl}/admin`; descripcion cerrada, no error original. `dispatchAlert` reclama/prepara antes de usar `sendEmail`. Registrar aceptacion solo con ID, capturar fallos con codigos cerrados. Nunca regenerar el mensaje ya preparado; ventana de 23 h a partir del primer intento persistido, incluso si no se sabe si Resend recibio.
- [ ] Ejecutar tests del directorio y `src/lib/email.test.ts`; esperar verde. Confirmar independencia de la cola de correo del cliente.
- [ ] Commit:
  ```powershell
  git add -- src/lib/operational-alerts/render.ts src/lib/operational-alerts/dispatch.ts src/lib/operational-alerts/dispatch.test.ts src/lib/operational-alerts/types.ts src/lib/operational-alerts/test-support.ts package.json
  git commit -m "feat: deliver operational alerts with safe retries"
  ```

## Tarea 4: Ronda acotada y resumen diario

**Files:** Crear `scan.ts`, `digest.ts`, `scan.test.ts`; ampliar `store.ts`, `types.ts` y test-support; actualizar `package.json`.

**Interfaces:**
- Consume detector, `AlertStore`, `dispatchAlert` y proyecciones seguras.
- Produce `ScanResult = { pendingCount: number; counts: Partial<Record<AlertCategory, number>>; references: SourceRef[]; partial: boolean; unchecked: string[]; examined: number }` y `scanOperationalIncidents(deps: { db: Firestore; store: AlertStore; now: () => number }): Promise<ScanResult>`.
- Ampliar `AlertStore`: `claimDailyRun(dayUtc: string): Promise<{ token: string } | null>`, `saveScanProgress(token: string, progress: ScanProgress): Promise<boolean>`, `prepareDigest(dayUtc: string, token: string, result: ScanResult): Promise<string | null>`, `finishDailyRun(dayUtc: string, token: string, result: ScanResult): Promise<boolean>`.
- `ScanProgress` guarda particion, cursor serializable, cobertura y conteos del ciclo; no DocumentSnapshots/payloads/PII. Produce `runOperationalDigest(deps: { db: Firestore; store: AlertStore; config: AlertConfig; send: typeof sendEmail; now: () => number }): Promise<{ status: 'disabled' | 'busy' | 'complete' | 'partial'; delivery: 'accepted' | 'retry' | 'review' | 'skipped' }>`.

- [ ] Tests del escaner y orquestador:
  ```ts
  expect(result.examined).toBeLessThanOrEqual(1000);
  expect(result.references).toHaveLength(20);
  expect(resultAtDeadline.partial).toBe(true);
  expect(await runWithOneQueryFailure()).toMatchObject({ status: 'partial' });
  expect(sendForEmptyCompleteRun).not.toHaveBeenCalled();
  expect(sendForSecondAcceptedRun).not.toHaveBeenCalled();
  ```
  Incluir >1000 documentos, presupuesto temporal agotado, continuacion de cursor, ninguna particion condenada a no ejecutarse, documento resuelto que sale de un filtro y fallo de lectura de su origen. Una sync correcta posterior resuelve fallo anterior; una erronea no reinicia el reloj de 36 h. Historia solo con fallos/no exito conocido no es catalogo sano.
- [ ] Ejecutar `npx.cmd vitest run src/lib/operational-alerts/scan.test.ts`; esperar rojo.
- [ ] Implementar paginas maximo 100, orden estable por ID y cursor persistido por coleccion. Para no perder campos legacy, recorrer `orders`, `emailJobs`, `webhookEvents` mediante proyecciones `.select(...)` seguras y filtrar estado con el detector. Repartir paginas por turnos; incluir reconciliacion de alertas abiertas y punto de continuacion, sin cargar colecciones enteras. Para catalogo paginar `syncRuns` por `createdAt` descendente (desempate ID), sin filtro compuesto, hasta acreditar ultimo exito/fallo o agotar presupuesto; desconocido/parcial no significa sano. Reexaminar la cabecera nueva en cada ronda aunque haya cursor historico.
- [ ] Contabilizar todos los documentos examinados, incluidas lecturas de reconciliacion/ledger; detener nuevas paginas a 1000 o 30 s y guardar progreso bajo lease. Es un presupuesto de inspeccion, no una garantia exacta de facturacion de reintentos Firestore. Configurar timeout de lecturas para que una peticion bloqueada no prolongue indefinidamente la ronda. Una particion fallida conserva cursor y se marca no comprobada.
- [ ] Reconciliar solo con origen leido y version valida; no resolver por no haber visto un ID en una pagina. Catalogo tiene una identidad agregada `catalog`, no una alerta eterna por cada fallo historico de `syncRuns`. Contar incidencias activas sin duplicarlas por pagina; si faltan paginas, presentar conteos como parciales. Entrega fallida/desconocida aparece en el resumen sin generar otro aviso recursivo.
- [ ] Crear delivery del digest en `operationalAlertRuns/day-<UTC>/deliveries/summary`, clave por entorno/fecha, congelado antes de enviar. Omitir solo resumen completo vacio; parcial/fallo de inspeccion merece resumen indicando cobertura. Segundo cron aceptado no reenvia. Reintentar con la misma clave solo dentro de 23 h. Un scan nuevo no modifica un digest ya preparado.
- [ ] Ejecutar tests del directorio; esperar verde. Agotar 30 s antes de enviar devuelve parcial; el envio y su timeout de 20 s existente requieren presupuesto adicional de la funcion, separado del escaneo.
- [ ] Commit:
  ```powershell
  git add -- src/lib/operational-alerts/scan.ts src/lib/operational-alerts/digest.ts src/lib/operational-alerts/scan.test.ts src/lib/operational-alerts/store.ts src/lib/operational-alerts/types.ts src/lib/operational-alerts/test-support.ts package.json
  git commit -m "feat: summarize operational incidents with bounded scans"
  ```

## Tarea 5: Observadores despues del commit y ruta protegida

**Files:** Crear `observe.ts`, `observe.test.ts`, `route.test.ts`, `src/app/api/operations/digest/route.ts`; modificar `src/lib/firestore.ts`, `src/lib/firestore.test.ts`, `vercel.json`, `package.json`.

**Interfaces:**
- Consume `Observation`, configuracion, `AlertStore.recordObservation`, `dispatchAlert`, `runOperationalDigest` e `isCronOrAdminRequest(request: NextRequest): boolean`.
- Produce `observeCommittedChange(observation: Observation): Promise<void>` y `GET(request: NextRequest): Promise<Response>`. Observador captura sus propios errores y devuelve `void`; todos los contratos publicos actuales de firestore permanecen iguales.

- [ ] Tests: fallo del registro, timeout de observacion, `after` lanzando error, transaccion reintentada y lease perdido. La respuesta comercial y el numero de efectos de proveedor son identicos al baseline:
  ```ts
  expect(orderResultWithBrokenAlerts).toEqual(orderResultWithoutAlerts);
  expect(providerCallsWithBrokenAlerts).toEqual(providerCallsWithoutAlerts);
  expect(scheduleInsideTransaction).not.toHaveBeenCalled();
  expect(unauthorized.status).toBe(401);
  expect(dbForUnauthorized).not.toHaveBeenCalled();
  expect(dbForPreview).not.toHaveBeenCalled();
  ```
  Comprobar fallos persistidos de pedido, job bloqueado, webhook y sync, tambien resoluciones. 401/payload no autenticado y `ProcessingBusyError` normal no generan aviso.
- [ ] Ejecutar `npx.cmd vitest run src/lib/operational-alerts/observe.test.ts src/lib/operational-alerts/route.test.ts src/lib/firestore.test.ts`; esperar rojo en nuevos comportamientos.
- [ ] Anadir observacion solo tras escrituras confirmadas en `completeClaimedFulfillment`/`applyClaimedShipment`, `createOrder`, `updateOrder`, `changeClaimedOrder` para `update`, `finishEmailJob`, `changeWebhookEvent`, cuarentena persistida en `beginWebhookEventProcessing` y `createSyncRun`. No observar renovaciones/liberaciones de lease como transiciones de incidencia.
- [ ] En transacciones devolver internamente proyecciones before/after junto con resultado, y llamar al observador fuera del callback, conservando el retorno publico boolean/void. Aplicar deletes de FieldValue al proyectar estado; no serializar sentinelas. En writes simples la lectura previa es best-effort solo si habilitado: su fallo no bloquea la escritura; `previous='unknown'` limita la primera deteccion al resumen. Revalidar/versionar frente a cambios concurrentes, no sobrescribir observaciones mas nuevas. Sin ciclos: alert-store importa `firebase-admin.ts`, nunca `firestore.ts`.
- [ ] Implementar observador: puerta de configuracion antes de I/O, persistencia acotada antes de devolver, fallo solo codigo seguro; programar entrega mediante `after` despues del resultado. Si `after` no puede programarse, conservar registro para recuperacion. No usar promesas sueltas ni esperar Resend dentro del flujo financiero.
- [ ] Implementar ruta: autenticar primero, desactivada devuelve 200 con `disabled` sin DB, ejecucion ocupada devuelve 200 con `busy`, fallo parcial explicito sin datos sensibles; fallo total inesperado 503 saneado. Declarar `runtime='nodejs'`, `dynamic='force-dynamic'`, `maxDuration=60`. Verificar compatibilidad del limite vigente antes de activar. Anadir solo segundo cron diario y test que conserva ambos horarios.
- [ ] Repetir tests de la tarea y `npx.cmd vitest run src/lib/order-service.test.ts src/lib/refund-service.test.ts src/lib/order-safety.integration.test.ts src/lib/printful-webhook-route.test.ts src/lib/stripe-webhook-route.test.ts`; esperar verde.
- [ ] Commit:
  ```powershell
  git add -- src/lib/operational-alerts/observe.ts src/lib/operational-alerts/observe.test.ts src/lib/operational-alerts/route.test.ts src/app/api/operations/digest/route.ts src/lib/firestore.ts src/lib/firestore.test.ts vercel.json package.json
  git commit -m "feat: observe incidents without changing order processing"
  ```

## Tarea 6: Verificacion, runbook y entrega desactivada

**Files:** Modificar `docs/operations.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/SECURITY.md`; crear `docs/verification/2026-10-12-operational-alerts.md`. Ajustar tests propios si la revision descubre huecos, siempre rojo antes del fix.

**Interfaces:** Consume ruta y workers anteriores. Produce evidencia con SHA, comandos, resultado y alcance; no un servicio activo ni una afirmacion de entrega en bandeja.

- [ ] Ejecutar `npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run build`. Esperar todos verdes sobre el mismo SHA/checkout; para esta superficie de seguridad ejecutar tambien `npm.cmd audit --omit=dev`, registrar avisos sin `--force` ni ampliar aceptaciones. No declarar audit limpio por aceptacion anterior.
- [ ] Ejecutar prueba local integrada: fallo sintetico -> ledger -> transporte capturado -> repeticion -> digest -> resolucion -> reaparicion, usando handlers reales y Firestore aislado/en memoria; espias verifican cero llamadas Stripe/Printful. Esto no acredita transacciones reales de Firestore: anadir ensayo con emulador aislado o entorno dedicado antes de activacion; si no esta disponible, dejarlo pendiente.
- [ ] Revisar diff con `requesting-code-review`: focalizar las cinco entradas de Review Focus y contratos financieros sin cambios. No considerar solo los mocks como prueba de fencing Firestore o de `after` en Vercel.
- [ ] Documentar configuracion inicialmente false, destinatario privado, horario UTC aproximado, cobertura parcial, recibo vs entrega, lectura de ultima ronda, incidentes digest-only, 23 h y atencion manual. Soporte sigue manual; no hay canal alternativo si Resend cae ni detector externo de caida total. La desactivacion conserva ledger/recibos y requiere redeploy autorizado.
- [ ] Registrar evidencia, incidencias que no se pudieron probar y `NO-GO` vigente. Separar pendientes stock/rollback/tracking; no cerrar su checklist con estos tests.
- [ ] Commit documental:
  ```powershell
  git add -- docs/operations.md docs/LAUNCH_CHECKLIST.md docs/SECURITY.md docs/verification/2026-10-12-operational-alerts.md docs/superpowers/specs/2026-10-12-operational-alerts-design.md docs/superpowers/plans/2026-10-12-operational-alerts.md
  git commit -m "docs: document operational alert coverage and activation gates"
  ```
- [ ] Antes de declarar rama lista: auditoria AGENTS completa, inventario de todos los PR/ramas/worktrees/archivos locales y revision de seguridad. Si se autoriza PR, adjuntarlo al chat; si se autoriza merge, verificar SHA/checks/mergeable/main y deployment real. No publicar ni integrar automaticamente por haber completado el plan.

## Activacion y comprobacion remota: puerta separada

- [ ] Tras integrar, revisar plan Vercel vigente, indices Firestore necesarios, entorno/credenciales y flag default-off. No reutilizar Preview compartido como sandbox. Obtener autorizacion concreta para configurar/activar y para un TEST ONLY al correo acordado; no copiar secretos al documento.
- [ ] En entorno realmente aislado validar transacciones, dos workers, cron repetido y timeout. Probar desactivacion alli; no mover aliases ni retroceder Production como parte de este ensayo.
- [ ] Configurar destinatario/sender/flag y redeploy solo con autorizacion. Verificar Production/cron, registrar `activatedAtMs`, iniciar sin rafaga historica. No crear fallos ficticios en pedidos reales para probar avisos.
- [ ] Ejecutar aviso controlado etiquetado TEST ONLY mediante runner temporal restringido, sin nuevo endpoint publico ni pedido comercial; documentar recibo y recepcion por separado. Si se aprueba temporalmente cargar credenciales, ignorarlas y eliminarlas al terminar.
- [ ] Observar primera invocacion cron autentica y reejecucion deduplicada; un GET manual solo demuestra la ruta. Mantener pendiente la verificacion operativa hasta tener evidencia. Si queda para otro dia, solicitar el mecanismo explicito de seguimiento, no prometer vigilancia de Codex.

## Autorrevision del plan — 2026-10-12

- Cobertura: detector/guardas (1), ledger/baseline/cupo (2), email/23 h (3), paginas/digest (4), hooks/auth/cron (5), gates/runbook (6); activacion externa separada.
- Contratos compartidos nombrados y propietarios de archivos delimitados; orden 1 -> 2 -> 3 -> 4 -> 5 -> 6. No implementadores simultaneos editando store/types.
- Cinco riesgos de Review Focus tienen tests asignados; se conserva evidencia historica y no se confunde simulacion con evento real.
- Metodo recomendado: subagente implementador y revisor nuevos por tarea, secuenciales por sus contratos; revision final de rama. Alternativa: implementacion por el agente principal con revision independiente al final.
