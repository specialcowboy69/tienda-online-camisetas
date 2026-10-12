# Alertas operativas: evidencia e integracion del 12 de octubre de 2026

Estado al cierre: PR #29 integrado y desplegado, alertas desactivadas. `NO-GO` vigente.
Las primeras secciones conservan la evidencia local anterior a la integracion;
el cierre remoto figura mas abajo y no sustituye las puertas de activacion.
Esta evidencia no autoriza envios reales ni configuracion de servicios.

## Identidad y alcance

- Rama: `codex/operational-alerts`; base de la funcion:
  `6c963d08870bb0d24a949d131b68ff0b87c2aa66`.
- Implementacion de tareas 1-5 y correcciones de revision:
  `c8254c1fcd0c2c3caf9442cc2b3f5b3d27a2d8fd`.
- SHA de codigo/tests comprobado en esta tarea:
  `2160bad00d5846dddbb9d8f0c7ebaf18f6f1f1d8`. Anade la prueba integrada y su
  entrada en `npm test`; no cambia codigo productivo. Los cambios posteriores
  de esta tarea son documentales. No se modifico el lockfile.
- PowerShell, Node `v24.15.0`, npm `11.12.1`, Vitest `2.1.9`, Next.js `15.5.26`.
  Dependencias instaladas previamente desde el lockfile de este worktree.
- Sin credenciales comerciales ni `.env` copiados, emails reales, pedidos,
  reembolsos, fabricacion, cambios de catalogo, push, PR, merge o deployment.

## Verificacion ejecutada

| Comando | Resultado sobre el codigo indicado |
| --- | --- |
| `npx.cmd vitest run src/lib/operational-alerts/lifecycle.integration.test.ts` | 1/1; codigo 0; 17:53:14, 4.89 s |
| `npm.cmd test` | 44 archivos, 671/671 tests; codigo 0; 17:54:49, 9.59 s |
| `npm.cmd run lint` | Codigo 0, sin diagnosticos |
| `npx.cmd tsc --noEmit --incremental false` | Codigo 0, sin diagnosticos |
| `npm.cmd run build` | Codigo 0; compilacion en 10.0 s, 6/6 paginas estaticas, ruta dinamica `/api/operations/digest` |
| `npm.cmd audit --omit=dev` | Codigo 1; 9 paquetes, 5 high / 4 moderate; detalle abajo |

Los cuatro gates completos se ejecutaron secuencialmente con parada ante codigo
no cero, sin cambios de codigo entre ellos. Las horas son las impresas por el
runner local. Solo aparecieron las dos
advertencias conocidas `Shipping customs evidence unavailable.` del fixture
`order service > rejects unverifiable options: failure`; no son advertencias
nuevas de alertas ni se ocultaron fallos. El audit se ejecuto sobre el mismo
lockfile antes del commit que solo anade el test; no equivale a un gate limpio.

### Ciclo integrado sintetico

`src/lib/operational-alerts/lifecycle.integration.test.ts` reutiliza el adaptador
Firestore en memoria con repeticion de callbacks transaccionales. Ejecuta
funciones reales de proyeccion, observacion post-commit, ledger, renderer,
dispatcher, autenticacion, handler GET y digest/scan. Solo sustituye fronteras
externas: DB, reloj, configuracion ficticia, scheduler `after` y transporte.

1. Una observacion sana establece la fecha de inicio; un fallo sintetico nuevo
   crea la generacion 1 y una entrega pendiente antes de programar transporte.
2. Ejecutar el callback capturado persiste el recibo ficticio; repetir observacion
   y callback no envia de nuevo.
3. GET autenticado resume una incidencia y guarda recibo; repetir el mismo dia
   no duplica el correo. El resultado diario se lee del ledger.
4. Estado sano mas reciente resuelve la incidencia, deja conteo cero y conserva
   el recibo historico. Una reaparicion posterior abre generacion 2 y otra clave.
5. Espias de funciones Stripe/Printful y de `fetch` registran cero llamadas;
   las escrituras hechas por la funcion solo van a colecciones operativas.
   PII y mensajes de error del fixture no llegan al ledger ni al correo capturado.

La prueba caracterizo comportamiento ya implementado: paso inicialmente, sin
fix productivo ni fase roja inventada. Los RED/GREEN anteriores corresponden a
las tareas de implementacion. Este ensayo no simula una autenticacion de webhook
de proveedor ni acredita el despliegue de `after`; sus regresiones independientes
y de equivalencia comercial estan incluidas en la suite completa.

## Audit productivo: snapshot exacto

Versiones obtenidas con `npm.cmd ls --omit=dev @fastify/busboy nanoid next postcss qs sharp source-map-js uuid gaxios --all`.
`npm audit` reporta paquetes afectados, no el numero de advisories. Las versiones
7.x de gaxios instaladas no se confunden con el hallazgo en 6.7.1.

| Paquete instalado | Severidad | Advisories devueltos por audit |
| --- | --- | --- |
| `@fastify/busboy@3.2.0` | high | `GHSA-xjh9-v7x6-24jw`, `GHSA-x8mw-p69m-v3mx`, `GHSA-gxm5-99cw-xjw9` |
| `nanoid@3.3.16` | high | `GHSA-2v37-7h3g-55p8` |
| `next@15.5.26` | moderate | `GHSA-4jqv-mc3x-m676`, `GHSA-mcj8-r9mp-w47p`; dependencia PostCSS |
| `postcss@8.4.31` | high | `GHSA-qx2v-qp2m-jg93`, `GHSA-6g55-p6wh-862q`, `GHSA-fxqj-rqcc-2cmp`, `GHSA-r28c-9q8g-f849` |
| `qs@6.15.3` | moderate | `GHSA-x5fp-wj9c-mxmx`, `GHSA-4mjr-xmp4-gh2g` |
| `sharp@0.34.5` | high | `GHSA-f88m-g3jw-g9cj`, `GHSA-rgj7-g3m4-5g8c`, `GHSA-wq5f-xc86-pv6w` |
| `source-map-js@1.2.1` | high | `GHSA-68fv-2mgg-jv7q` |
| `uuid@9.0.1` | moderate | `GHSA-w5hq-g745-h8pq` |
| `gaxios@6.7.1` | moderate | Dependencia vulnerable UUID anterior |

El informe propuso `npm audit fix`; no se ejecuto. No se hicieron upgrades,
overrides ni `--force`. Recuento/nombres coinciden con la auditoria documentada
el 11 de octubre; no se compararon todas las revisiones de advisories con el
snapshot aceptado el dia 8. No hay nueva aceptacion de riesgos. El alcance de
desarrollo y su remediacion siguen separados en [SECURITY.md](../SECURITY.md).

## Decisiones y limites conservados

- La configuracion valida se comprueba antes del I/O, tambien en el store.
  Local/Preview sin configuracion ficticia inyectada quedan desactivados.
- Las escrituras simples de pedido/catalogo no prueban predecesor atomico.
  Su observacion usa `previous='unknown'`; la contrapartida es esperar al
  resumen para algunos fallos. Los hooks transaccionales observan despues de
  commit y pueden probar transiciones inmediatas sin alterar contratos financieros.
- Una resolucion valida invalida un aviso aun no preparado. Los intentos ya
  preparados conservan mensaje/clave/recibo por posible aceptacion remota.
- Hay cursor durable con token propietario, reparto de particiones y barrido
  final del ledger. El presupuesto cuenta lecturas internas y puede ser
  conservador: algunas incidencias esperan otra ronda. No es snapshot global.
- La historia de catalogo tiene cursor para nuevas cabeceras y conserva el
  historico; solo admite evidencia temporalmente coherente de ultimo exito.
  Historia desconocida o invalida sigue parcial, sin rehabilitar timestamps.
- El cupo de 20 por hora limita avisos iniciales, no el unico digest idempotente
  diario. Un digest preparado conserva su fotografia aunque otro scan cambie.
- El segundo de espera del observador no puede cancelar un commit ya enviado.
  La ventana segura de reintento es 23 horas; un recibo ambiguo sigue requiriendo
  revision. Sin Resend no hay canal alternativo; soporte y vigilancia siguen manuales.

Detalles menores trasladados a revision final, antes de la correccion registrada
abajo: el dispatcher podia devolver
`skipped` si la ventana vence durante prepare aunque el registro ya este en
`review` (no envia); el comparador del adaptador sintetico iguala ciertos ISO y
Timestamp que Firestore ordena por tipo. La comprobacion de valores undefined
anidados del adaptador fue corregida en tarea 4. Estos puntos no se convierten
en prueba de comportamiento remoto ni se ocultan tras la suite verde.

## Correccion de revision final — 12 de octubre de 2026

Codigo y tests: `81ced848327659a0b187317367a36905c1e8c6b7`, sobre la entrega
documental `872a263852b4f86b8ea55fda4bbc62c9573ad962`. Esta seccion conserva
los resultados anteriores como historia y registra el alcance comprobado del fix.

- P1 corregido: la identidad comercial excluye mantenimiento rutinario de
  leases. El detector sigue consultando su vencimiento actual. La regresion usa
  `updateClaimedOrder` real con lease, `releaseOrderProcessing` o
  `renewOrderProcessing` real, avance de 900001 ms y GET/digest reales sobre DB
  sintetica: un `order_stale`, sin alterar el `updatedAt` comercial. Tambien se
  prueban leases renovados y su vencimiento para email/webhook.
- Contradicciones reales de la misma version crean o reabren `source_unreadable`
  con reconciliacion pendiente; volver al estado anterior con la misma version
  no basta para resolverlas. Observaciones simplemente antiguas siguen ignoradas.
  La identidad usa solo diferencias que afectan a la clasificacion; no confunde
  errores arbitrarios omitidos por la proyeccion segura del scanner.
- Minor 1 corregido: si vencen las 23 horas entre claim y prepare, el store
  devuelve un motivo cerrado y el dispatcher devuelve `review`. Conserva
  mensaje/clave/primer intento, no envia y elimina el lease propio al cerrar.
- Minor 2 corregido: cursor de catalogo exclusivamente Timestamp nativo; otros
  tipos encontrados dejan `partial`/`unchecked=catalog`. No hay migracion de
  datos. Fixtures de continuacion usan Timestamp nativo y el comparador
  sintetico distingue tipos y conserva nanosegundos.

TDD focalizado: primera ejecucion con 7 fallos esperados y 56 pases; el primer
ajuste revelo un falso conflicto de proyeccion en el lifecycle existente
(90/91), corregido sin ampliar campos leidos. Dos regresiones adicionales de
reaparicion/persistencia de contradicciones fallaron antes de su ajuste. Resultado
focal final: 4 archivos, 94/94, codigo 0, 18:34:34, 2.84 s.

| Comando sobre `81ced84` | Resultado final |
| --- | --- |
| `npm.cmd test` | 44 archivos, 681/681; codigo 0; 18:35:14, 36.91 s |
| `npm.cmd run lint` | Codigo 0, sin diagnosticos |
| `npx.cmd tsc --noEmit --incremental false` | Codigo 0, sin diagnosticos |
| `npm.cmd run build` | Codigo 0; compilacion 10.9 s, 6/6 paginas, `/api/operations/digest` dinamica |
| `npm.cmd audit --omit=dev` | Codigo 1; 9 vulnerabilidades, 4 moderate y 5 high; mismos paquetes/advisories listados arriba |

No hubo cambios de codigo entre estos gates. La suite conserva las dos
advertencias conocidas `Shipping customs evidence unavailable.` del fixture
`order service > rejects unverifiable options: failure`. Audit no esta limpio;
no se ejecutaron upgrades ni se amplio ninguna aceptacion. Los cambios posteriores
a este SHA son documentales. La revision independiente del fix y la auditoria
de integracion corresponden al controlador; estos gates no acreditan Firestore
real, activacion, cron desplegado, proveedor, buzon ni nuevos permisos comerciales.

## Cierre independiente local — 12 de octubre de 2026

La revision completa de la rama y la re-revision acotada del rango
`872a263..77fc58c` estan completadas. El revisor independiente verifico los
hallazgos de leases/contradicciones, vencimiento de prepare y cursores nativos;
todos atendidos, sin nuevos hallazgos criticos/importantes ni observaciones
adicionales fuera de alcance.

El controlador repitio sobre `77fc58c63cdeb2da5d1488de167c1c3f9d5178dd`:
`npm.cmd test` (44 archivos, 681/681; 18:51:42, 8.54 s),
`npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false` y
`npm.cmd run build`, todos codigo 0. No hubo cambios entre los gates;
permanecen solo las dos advertencias conocidas del fixture de aduanas. El
audit productivo repetido por el controlador termino con 5 altos/4 moderados
tras un primer intento con ECONNRESET; no se interpreto el error de red como
resultado limpio.

La auditoria AGENTS se refresco con fetch, PRs abiertos, ramas por ascendencia
y los tres worktrees. El checkout de implementacion estaba limpio; los cambios
documentales ajenos permanecieron intactos. El inventario vigente se comunica
en la entrega, no se replica como una lista durable de pendientes en esta guia.
Los cambios posteriores a ese SHA para registrar el cierre son solo documentales.
En esa fase local no se publico, integro, configuro ni activo ningun servicio.

## Integracion y despliegue verificados — 12 de octubre de 2026

- [PR #29](https://github.com/specialcowboy69/tienda-online-camisetas/pull/29),
  base `main`, head `99e99d9e4353d0aa8305ebb1e9b09a7814c2c408`, integrado con
  merge normal a las 17:36:19 UTC. Merge:
  `d95104e1c1fefad1ffdfae27c28312a6fac73c21`, comprobado en `origin/main`.
  El arbol del merge coincide exactamente con el head verificado.
- Gates repetidos sobre ese head: 681/681 tests (44 archivos; 19:34:18 Madrid,
  9.09 s), lint, TypeScript sin incremental y build: todos codigo 0.
  Audit productivo de `c14d283`: codigo 1, 5 altos/4 moderados/0 criticos;
  entre ese SHA y el head solo cambio documentacion, no dependencias.
- GitHub no publicaba check-runs ni estados de checks; no se presentan como
  checks verdes. Se verificaron gates locales y Preview Vercel `READY` para
  el SHA exacto (`dpl_6SsoVsd2TfjXW68uommbeJFAjmcr`) antes del merge.
- Production `dpl_BUWEjAMtTdG4S7dDS96VFY3z16As`, target Production, `READY`,
  gitSource `main` y SHA de merge exacto. Alias `www.funnyteesforall.com`,
  `funnyteesforall.com` y `tienda-online-camisetas.vercel.app`.
  [Deployment](https://vercel.com/specialcowboy69s-projects/tienda-online-camisetas/BUWEjAMtTdG4S7dDS96VFY3z16As).
- GET publicos en el dominio canonico: `/`, `/products` y
  `/products/falling-apart-cat-graphic-tee`: 200. GET sin autenticacion de
  `/api/operations/digest`: 401 `Unauthorized`. No se invoco un digest autenticado.
- El inventario Production no contenia `OPERATIONAL_ALERTS_ENABLED` ni
  `OPERATIONAL_ALERTS_TO`: el feature permanece desactivado. Proyecto Node 24.x.
  No se copiaron credenciales ni cambiaron variables, indices, alias o proveedores.
  Los valores ocultos de Stripe Tax/fabricacion no se revalidaron en esta entrega.
- Revision automatica P2 del indice: documentada como bloqueo de activacion
  (seccion siguiente), no declarada corregida ni descartada. El despliegue
  desactivado no acredita transacciones, indice, cron ni email de alertas reales.

## Puertas pendientes antes de activar

Revision automatica de GitHub en PR #29: P2
[indice de grupo deliveries](https://github.com/specialcowboy69/tienda-online-camisetas/pull/29#discussion_r4250616705).
Se confirmo la forma de consulta y la exigencia documentada por Firebase; no
se consultaron ni modificaron indices remotos. Se acepta como bloqueo de
activacion, no como defecto corregido: el despliegue se integra desactivado.
Runbook y checklist nombran la consulta que debe provisionarse y probarse.
Sin indice el scanner informa cobertura parcial; no se declara sano.

- [x] Revision independiente final de los cinco puntos Review Focus,
  correcciones y auditoria AGENTS local. Refrescar inventario y checks antes de
  crear PR o integrar; esta evidencia no autoriza acciones remotas.
- [x] Integracion autorizada; PR #29/SHA y deployment registrados en el cierre anterior.
  Este documento no constituye inventario vigente de otras ramas/PRs.
- [ ] Firestore en emulador o entorno dedicado realmente aislado: indices,
  concurrencia/contencion, dos workers, lease antiguo, replay y timeout. No se
  encontro Java/jar del emulador en la preparacion; no se instalo ni se utilizaron
  credenciales productivas. El adaptador serializado no acredita esta puerta.
- [ ] Revisar plan Vercel vigente, duracion permitida, `after`, cron declarado y
  configuracion real. Preview compartido no sirve como sandbox aislado.
- [ ] Autorizar destinatario privado, remitente, flag y redeploy; verificar
  `activatedAtMs`, ausencia de rafaga historica y desactivacion conservando ledger.
- [ ] TEST ONLY controlado mediante runner restringido sin nuevo endpoint publico:
  recibo y recepcion separados; luego primera invocacion cron autentica y replay
  deduplicado. GET manual no demuestra programacion real.

No se cerraron stock/productos, tracking autentico, rollback aislado, buzon de
soporte, fiscalidad, pagos live o fabricacion. `STRIPE_TAX_ENABLED=false`, bloqueo
CA/GB y `NO-GO` se conservan como decisiones; no se revalidaron
los valores ocultos de configuracion remota ni se cambiaron variables.
El procedimiento operativo y las limitaciones de cobertura
estan en [operations.md](../operations.md#alertas-operativas-implementacion-desactivada).
