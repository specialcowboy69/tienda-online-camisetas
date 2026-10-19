# Checklist de lanzamiento — No Context Club

Este documento es la lista operativa para lanzar la tienda con ventas reales.
Se actualiza cada vez que una tarea queda terminada y verificada.

**Estado global:** `NO-GO — todavía no aceptar pagos reales`

**Ultima revision documental:** 19 de octubre de 2026 (paginas publicas de
privacidad y cookies integradas en #38 y verificadas en Production; GA4 sigue
apagado; no cambia el estado `NO-GO`).

## Resumen vigente y fuente de estado

### Analítica opcional — entrega del 13 de octubre

- [x] Preparar consentimiento previo de GA4 `G-4JDZCBK8SY`, rechazo/retirada,
  caducidad, exclusión de rutas sensibles y pruebas locales de navegador.
- [x] Integrar y desplegar apagado: PR #35, merge `2bd0f7a`, Vercel Production
  `dpl_GgYD23Vk8F5vd2mDA6RhvcjBAG5J` READY. Dominio público verificado en home,
  catálogo y PDP a 390/1440 px: ajustes indican Analytics off, sin etiqueta ni
  solicitudes a Google incluso con una aceptación previa en el navegador.
- [x] Publicar privacidad y cookies con la identidad facilitada por el titular,
  enlaces reales en footer, ajustes y checkout: PR #38, merge `4637a83`,
  Vercel Production `dpl_GwBUEjaeDumw3oJpoPGgDxpr9TY4` READY.
  Ambas rutas dan HTTP 200 en el dominio público.
- [x] Montar prueba local de gtag.js real con colectores interceptados. La
  prueba limitada observó consentimiento previo y retirada, pero la prueba
  ampliada detectó un evento automático `scroll` adicional y falla de forma
  intencionada hasta ajustar la propiedad. No se envió una visita a GA4.
- [ ] Repetir la prueba ampliada sin eventos automáticos ni datos sensibles.
- [ ] Desactivar o ajustar Medición mejorada en la propiedad GA4 y confirmar
  cambios de historial y conservación; revisar con el titular los textos,
  activar el flag en Vercel y comprobar recepción en Realtime/DebugView.

[Evidencia local y límites](verification/2026-10-13-ga4-consent.md) y
[procedimiento](analytics-and-consent.md). No cambia NO-GO ni activa Ads, Tax,
conversiones o pagos. Los estados históricos de abajo conservan su fecha.

Esta checklist es la referencia principal de avances y pendientes. El roadmap
ordena el trabajo; el runbook explica como operarlo. Las pruebas historicas se
conservan con fecha: no prueban por si solas la configuracion actual de un proveedor.
Estar desplegado en Vercel Production no significa tener autorizados pagos live.

| Area | Estado documental; evidencias historicas fechadas |
| --- | --- |
| Integracion | Paginas públicas de #38 en Production (`4637a83`); GA4 de #35 apagado. Registro de stock de #31, alertas desactivadas de #29 y control UE de #27 conservados |
| Envios | Seis destinos previstos US/ES/FR/DE/IT/PT; CA/GB bloqueados por codigo; control preventivo UE integrado y comprobado en cotizaciones publicas |
| Pagos y pedidos | E2E test posterior a #27; reembolso pending autentico seguido de full, parcial historico y dos borradores cancelados con permiso. No acredita ventas live ni fabricacion |
| Webhook Printful | Registro de stock corregido: IDs de catalogo 162/317/586/1579. Dos eventos product_updated autenticos procesados el 12 de octubre; cambio interno y restauracion reflejados en Firestore. Sigue pendiente stock_updated y envio real |
| Email | Confirmacion y recuperacion recibidas en Gmail, capturas del propietario del 12 de octubre. Correo de envio, rebotes y canal de soporte pendientes |
| Operacion | Vigilancia manual definida; alertas de #29 desplegadas pero desactivadas; indices, pruebas remotas y activacion pendientes |
| Legales | Privacidad y cookies públicas con identidad y soporte facilitados por el titular; revisión jurídica externa, otras plantillas y pendientes de lanzamiento siguen abiertos. El texto PDP de incidencias de #34 permanece vigente |
| Riesgo residual | Aceptacion productiva del 8 de octubre; audit repetido el 11 y avisos de desarrollo pendientes en SECURITY.md, sin ampliar la aceptacion |

**Aplazado, no completado:** la compra real controlada y el trabajo fiscal
se han pospuesto por decision de la persona propietaria. La recepcion de los dos
correos de prueba si quedo acreditada por las capturas aportadas el 12 de octubre.
Se conserva su estado `[ ]`; aplazarlos no elimina riesgos, obligaciones ni los
criterios de GO. No ejecutar compra live, activar fabricacion o Stripe Tax como
parte de una tarea documental. La decision vigente es mantener
`STRIPE_TAX_ENABLED=false`; los valores efectivos deben verificarse al retomar
pruebas con efectos. Las ocho suscripciones Stripe test se comprobaron el 11
de octubre; no equivale a probar todos los tipos ni configurar live. La transicion
historica de workers sigue pendiente de acreditar.

### Textos de incidencias y borradores legales — 13 de octubre de 2026

Aplicación inicial el 13 de octubre de la decisión del propietario, entonces
solo local (cierre de integración del 14 de octubre debajo): defectos o
errores de la tienda confirmados se resuelven mediante reposición sin coste o
reembolso a elección del cliente, sin devolución ni recogida. El desistimiento
por cambio de opinión permanece separado y conserva sus derechos.

- [x] Actualizar el texto breve de PDP y la plantilla de incidencias, manteniendo
  los derechos legales y sin mencionar al proveedor en ese texto público.
- [x] Reutilizar orders@funnyteesforall.com como contacto en las plantillas;
  no inventar identidad, domicilio, teléfono ni plazos de respuesta.
- [x] Incorporar estimación general de producción de 2-5 días laborables,
  separada del transporte; no atribuir rangos de tarifa plana a cotizaciones API.
- [x] Preparar [privacidad](legal-templates/privacy-policy.md) y
  [cookies](legal-templates/cookie-policy.md) según el código actual,
  distinguiendo datos comprobados de campos pendientes.
- [ ] Completar/revisar/publicar las plantillas: en pausa por decisión del
  propietario. La preparación de borradores no cierra este requisito.
- [ ] Verificar entrada de soporte y solicitudes de derechos. Las capturas
  anteriores acreditan correo saliente recibido, no recepción en este canal.
- [x] Actualizar los borradores al estado posterior a #35: consentimiento GA4
  y Cookie settings implementados, con Analytics desplegado apagado.
- [ ] Antes de activar GA4: inventario del SDK real, información legal revisada,
  ajustes de propiedad, pruebas y autorización separada. Ads no implementado.

Verificación histórica del 13 de octubre: prueba de política RED (falla con el texto anterior) y GREEN;
708/708 tests, TypeScript y build correctos. El primer intento de suite también
tuvo un timeout incidental en order-safety; 22/22 pruebas focalizadas y la nueva
suite completa pasaron sin cambiar código de pedidos ni ampliar timeouts.
`npm.cmd run lint` sigue fallando por cuatro errores `no-require-imports` en
los auxiliares locales ignorados `.superpowers/eu-quotes.cjs` y
`.superpowers/eu-risk-contract.cjs`; no se modifican ni se incluyen en Git.
`npx.cmd eslint . --ignore-pattern '.superpowers/**'` pasa. No se presenta el
lint estándar como verde.

**Cierre verificado del 14 de octubre:** [PR #34](https://github.com/specialcowboy69/tienda-online-camisetas/pull/34)
`MERGED`, SHA `23c49402a311d8e7eccdbdcfd8ee0c91edfb6892` contenido en `origin/main`.
Vercel Production `dpl_Gx9B9rUCt51j3ZTeQoGeHEtdYaqg` READY, sirviendo
`www.funnyteesforall.com`; el árbol coincide con el head revisado `7322a4a`.
773/773 tests, TypeScript y build correctos. Lint completo pasa sobre exportación
limpia del árbol exacto; el checkout conserva los cuatro errores de helpers
ignorados descritos arriba. Revisión independiente sin bloqueos técnicos.
Seis comprobaciones públicas (home/catálogo/PDP, 390/1440 px): textos nuevos
visibles, sin desbordamiento horizontal en PDP y Analytics apagado, incluso con
consentimiento previo guardado. Cero solicitudes Google y escrituras comerciales.
[Evidencia, comandos y límites](verification/2026-10-14-legal-policy-delivery.md).

Las plantillas siguen siendo internas. No crea páginas legales públicas, no altera
checkout, cotización, alertas, pedidos ni devoluciones automáticas. Stripe Tax,
pagos live y fabricación no se activan; estado global `NO-GO` sin cambios.

### Cierre tecnico posterior a #28 — 11 de octubre

La [evidencia detallada](verification/2026-10-11-launch-checks.md) distingue
proveedores reales, fallo de email simulado, limites y registros conservados.
Se verifico una compra test a ES con envio incluido, reembolso pendiente que
paso a completo, recuperacion del email por Vercel y cancelacion autorizada de
los borradores `179691582` y `180436734`, sin fabricacion. Los snapshots
historicos de abajo se conservan; sus pendientes de pending/email/borrador
quedan actualizados por esta prueba, no borrados retrospectivamente.

Home y catalogo se revisaron en movil/escritorio; dominio canonico y accesos
sin autenticar comprobados. Tests 477/477, TypeScript y build correctos.
Lint del codigo pasa excluyendo `.superpowers/**`; el comando estandar falla
por helpers locales ignorados preexistentes. Audit no esta limpio. La revision
de los criticos del tooling esta documentada, pero su solucion/aceptacion sigue
pendiente. No se activaron live, Tax, alertas automaticas ni se ejecuto rollback.

### Tracking y recepcion de correo — 12 de octubre

La [verificacion fechada](verification/2026-10-12-webhooks-tracking-operations.md)
recoge las capturas de Gmail y la simulacion aislada de tracking/enlace, replay,
segundo paquete y recuperacion tras 503. No acredita un envio fisico ni un email
de tracking real. El hallazgo inicial de registro de stock se corrigio despues
con #31; los resultados posteriores se registran a continuacion. El preview
compartia metadata de credenciales con Production: el ensayo de rollback sigue
pendiente de un entorno aislado, no se ejecuto sobre datos comerciales.

## Registro de stock — cierre del 12 de octubre de 2026

El [PR #31](https://github.com/specialcowboy69/tienda-online-camisetas/pull/31)
esta integrado mediante `ff37910aa1fe6bf704ea331afffa3874f540a5bc`.
Production `dpl_5xhcQjN9Sgxc8uZQDsMHH2kVxXDA`, `READY`, sirve el dominio canonico.
708/708 tests, lint, TypeScript y build; revision independiente y fix de su hallazgo
con RED/GREEN. Registro remoto autenticado `200` y lectura posterior verifican el
filtro de stock correcto sin cambiar URL, secreto, eventos o parametros ajenos.
[Evidencia, mappings y limites](verification/2026-10-12-printful-stock-registration.md).
En ese primer cierre, el evento autentico nuevo y su efecto en catalogo seguian
`[ ]`; no se fabricaron, cobraron ni modificaron productos para esa comprobacion
del registro. La prueba posterior autorizada se detalla a continuacion.

## Producto actualizado — prueba remota del 12 de octubre de 2026

Dos eventos autenticos `product_updated`, generados por Printful tras cambiar y
restaurar un identificador interno de Falling apart, quedaron `processed` sin
reintentos. Firestore reflejo ambos valores; las 35 variantes y los datos
comerciales e imagenes del catalogo permanecieron iguales. El PDP respondio 200.
Deployment `dpl_MBy67mxbAQ4jmK4b6e6JBbEauJSq`, SHA `41f9e3a`.
[Eventos, tiempos, restauracion y limites](verification/2026-10-12-product-updated-live.md).
Se cierra la prueba de producto, no la de stock. Sin pedidos, pagos ni fabricacion;
`stock_updated`, alertas, tracking y rollback conservan sus pendientes. Se mantiene `NO-GO`.

## Alertas operativas — integracion del 12 de octubre de 2026

El [PR #29](https://github.com/specialcowboy69/tienda-online-camisetas/pull/29)
se integro mediante `d95104e1c1fefad1ffdfae27c28312a6fac73c21`.
Vercel Production `dpl_BUWEjAMtTdG4S7dDS96VFY3z16As` quedo `READY` sobre ese SHA
y sirve el dominio canonico. Home, catalogo y PDP respondieron 200; el resumen
sin autenticacion respondio 401. El inventario de variables Production no
incluia el flag ni el destinatario de alertas: la funcion permanece desactivada.
[SHA, comandos y alcance de evidencia](verification/2026-10-12-operational-alerts.md).
No cambia `NO-GO` ni acredita vigilancia automatica o envios de correo operativos.

- [x] Implementacion y prueba sintetica local del ciclo de alertas, sin efectos
  Stripe/Printful ni email real; configuracion y procedimiento en
  [operations.md](operations.md#alertas-operativas-implementacion-desactivada).
- [x] Revision independiente y re-revision de las correcciones; 681/681 tests,
  lint, TypeScript y build repetidos sobre `99e99d9`, cuyo arbol coincide con el
  merge. Audit no limpio: 5 altos y
  4 moderados, sin nueva aceptacion ni cambios de dependencias.
- [x] Integrar y registrar PR/SHA y deployment real de la funcion: #29, evidencia anterior.
- [ ] Verificar contencion/transacciones e indices en Firestore aislado,
  dos workers, timeout y desactivacion; los mocks no acreditan estos puntos.
  - Bloqueo concreto de PR #29: provisionar y comprobar el indice de grupo
    `deliveries` para la consulta de estados pendientes/processing/review;
    no esta incluido ni verificado por esta entrega desactivada.
- [ ] Revisar plan/runtime Vercel y autorizar configuracion/activacion remota.
- [ ] Comprobar aviso TEST ONLY, recibo y recepcion por separado, primera
  invocacion cron autentica y repeticion deduplicada.

Stock autentico, tracking genuino, rollback aislado, soporte, fiscalidad y
compra live siguen siendo tareas separadas. No se completan con estas pruebas.

## Seguridad de pedidos: implementacion y prueba controlada

La fase inicial de `codex/order-safety-and-refunds` cubrio localmente
validacion de pago/direccion, propiedad de eventos y pedidos, recuperacion
Printful con identidad estable,
email durable y reconciliacion canonica de reembolsos. Las regresiones combinadas
usan servicios reales del codigo y transportes sinteticos. La comprobacion visual
local usa componentes reales y APIs interceptadas en escritorio/movil. Despues se
integraron los PR [#21](https://github.com/specialcowboy69/tienda-online-camisetas/pull/21),
[#22](https://github.com/specialcowboy69/tienda-online-camisetas/pull/22) y
[#23](https://github.com/specialcowboy69/tienda-online-camisetas/pull/23).

Una prueba controlada posterior al merge de #23 (`main` en `6789b9d`) comprobo
un pago Stripe test y su webhook firmado, el pedido en Firestore, un pedido
Printful en estado `draft`, la aceptacion del email de confirmacion por el
proveedor y un reembolso completo reflejado en Stripe y Firestore. Una primera
compra de prueba quedo en `manual_review` cuando Stripe cambio materialmente
la direccion; se reembolso completamente y no se creo pedido remoto ni se
acepto email de confirmacion. No se observo fabricacion.
En aquella prueba no se verificaron bandeja ni compra live. Las capturas del
12 de octubre acreditan despues los dos correos del test del dia 11, no los
correos de esta prueba historica ni una compra live. El
estado global permanece `NO-GO`.

El 8 de octubre se comprobo otro checkout Stripe test expirado sin pago:
`e370c5da31fc4c6daa99903539f45df0` quedo `expired` en Firestore. Un
segundo checkout de preparacion, `53371f22e9d14866894f697b6fe71407`,
tambien se expiro sin pago. Sobre el pedido test ya bloqueado
`7fa47ac9855e44ae86b531d887df65d1` se hizo un unico reembolso parcial de
USD 5.00: Stripe marco `succeeded`, `orders/<id>/refunds` guardo el recibo,
`refundSummary` quedo `partial` con 500/3999 centavos y
`fulfillmentBlocked=true`; Printful devolvio 404 para su ID externo. Un
`refund.updated` concurrente termino inicialmente en `ProcessingBusyError`;
el reenvio del **mismo evento** `evt_3UNammRp3VC0CE6j15eKxqwN` lo dejo
`processed` sin duplicar el reembolso. Esto no prueba todavia un reembolso
`pending` real: los 63 tests focalizados de reembolso/seguridad cubren ese
estado con transportes sinteticos.

Para el webhook real de Printful se creo solo el borrador sintetico
`179951879` (`codexwh20261008a4f531df`) con `confirm=0`. El evento
`order_created` llego a `webhookEvents` como `processed` en un intento. El
borrador sintetico termino `canceled`, sin confirmacion ni fabricacion. No se
observo un evento `order_canceled` para ese borrador; tampoco se ha probado
todavia un evento de envio de un pedido real. El borrador **anterior**
`179691582`, asociado a un pago test reembolsado completamente, estaba en
`draft` en esa consulta. Este cierre documental no lo ha vuelto a consultar,
borrado ni confirmado.

Por decision de la persona propietaria se omite ahora la comprobacion del
buzon receptor. El email fue aceptado por el proveedor en la prueba anterior,
pero **no se afirma entrega en bandeja**; esa comprobacion permanece pendiente.

El 7 de octubre de 2026, `npm.cmd test` paso 365/365 tests sobre el SHA base
`6789b9d`. Esta comprobacion local no sustituye las verificaciones de live.

- [x] ~~Revision e integracion de la seguridad de pedidos y los dos fixes de
  direccion mediante PRs #21, #22 y #23.~~
  - Evidencia: merges en `main`; #23 quedo incluido en `6789b9d`.
- [ ] Recuperar y registrar la evidencia de la transicion original de workers
  sin fencing; no se da por acreditada aqui. Para futuros cambios de protocolo
  o rollback a una version incompatible, aplicar el drenaje de DEPLOYMENT.md.
- [x] ~~Confirmar las ocho suscripciones Stripe primero en test, sin backfill masivo.~~
  - Lectura del endpoint enabled el 11 de octubre; ver evidencia detallada.
- [ ] Prueba sandbox del flujo completo, eventos concurrentes/repetidos,
  reembolso parcial y pending, recuperacion de emails y lease busy 503.
  - Verificado parcialmente: pago completo, reembolsos completo y parcial,
    expiracion de checkout, y dos eventos concurrentes recuperados al reenviar
    el mismo ID. El 11 de octubre se anaden pending real, nuevo E2E a ES y
    recuperacion de email tras 503 simulado localmente. No cubre todos los
    fallos/leases, aceptacion perdida ni condiciones de concurrencia.
- [ ] Verificar entrega de email/rebotes por separado de aceptacion Resend.
- [ ] Revisar legacy sin jobs, confirmaciones faltantes y cutoff de 23 horas,
  sin mensajes historicos automaticos; asignar responsable de recuperacion.
- [x] ~~Revisar procedimiento de reembolso manual Stripe y cancelacion Printful
  por separado; no desbloquear latches ni estados terminales mediante Retry.~~
  - El 11 de octubre se concilio el refund y se cancelaron por separado dos
    borradores autorizados. No se probo cancelacion de fabricacion en curso.
- [x] ~~Registrar la aceptacion expresa de los advisories actuales.~~
  - El 8 de octubre `npm.cmd audit --omit=dev --json` conto **9 paquetes**:
    0 critical, 5 high y 4 moderate. La aceptacion temporal consta en
    [SECURITY.md](SECURITY.md); no equivale a corregirlos ni a dar GO.
- [ ] Evaluar y remediar los avisos criticos del tooling de tests detectados
  en el audit completo del 11 de octubre (Vitest/Tinypool). No estan aceptados
  por la decision sobre dependencias productivas; ver SECURITY.md.
- [ ] Compra real controlada y autorizada, monitorizacion y rollback verificados
  — compra aplazada por decision de la persona propietaria.

Detalles operativos en [operations.md](operations.md) y despliegue seguro en
[DEPLOYMENT.md](DEPLOYMENT.md). No marcar compras, webhooks remotos ni entrega de
correo como realizadas basandose en mocks, capturas locales o build.

## Como actualizar esta lista

- `[ ]` significa pendiente o todavia no verificado.
- `[x] ~~Texto~~` significa terminado y comprobado con evidencia.
- Una tarea aplazada conserva `[ ]` y explica la decision; no es una tarea
  completada ni una exencion del criterio de lanzamiento.
- Cada evidencia indica fecha, entorno y SHA/PR cuando exista. Diferenciar
  codigo, tests locales, cotizacion publica y operaciones reales de proveedores.
- Una tarea no se marca como terminada solo porque este configurada: debe
  probarse en el entorno correspondiente.
- La evidencia puede ser un Pull Request, un deployment, una captura del
  proveedor, un evento registrado o el resultado de una prueba.
- No se deben guardar secretos, tokens ni valores sensibles en este documento.

## 1. Integracion y despliegue del storefront

- [x] ~~Desarrollar el rediseno de la home y `/products` en una rama de
  feature.~~
  - Evidencia: PR
    [#16 — Redesign No Context Club home and products](https://github.com/specialcowboy69/tienda-online-camisetas/pull/16).
- [x] ~~Revisar y mergear el PR #16 contra `main`.~~
  - Evidencia: commit de merge `9bc329fd` en `main`.
- [x] ~~Confirmar que Vercel ha desplegado el commit mergeado desde `main`.~~
  - Evidencia: deployment de produccion `Ready`; los despliegues posteriores
    de `main` conservan el storefront.
- [x] ~~Revisar visualmente home y `/products` en produccion, tanto en escritorio
  como en movil.~~
  - Chromium, 1440x900 y 390x844, el 11 de octubre. No acredita Safari/Firefox
    ni auditoria exhaustiva de accesibilidad o rendimiento.
- [x] ~~Comprobar una compra representativa desde PDP hasta checkout tras el despliegue.~~
  - Falling apart Black S a ES, Stripe test; evidencia detallada. Pendiente
    ampliar a todos los PDP, destinos y carrito mixto.

## 2. Acceso publico y dominio

- [x] ~~Conectar `funnyteesforall.com` y `www.funnyteesforall.com` con Vercel.~~
  - Evidencia: ambos dominios alcanzan la plataforma de Vercel.
- [x] ~~Desactivar la proteccion SSO de Vercel para el deployment de
  produccion.~~
  - Evidencia: el dominio de produccion es accesible publicamente sin login.
- [x] ~~Confirmar que `https://www.funnyteesforall.com` devuelve la tienda
  publica y no una pantalla de acceso de Vercel.~~
  - Evidencia: `/` devolvio `200` el 29 de septiembre de 2026.
- [x] ~~Confirmar que `/products` y una pagina individual de producto responden
  publicamente.~~
  - Evidencia: `/products` y `/products/falling-apart-cat-graphic-tee`
    devolvieron `200`.
- [x] ~~Confirmar que `/api/webhooks/stripe` y `/api/webhooks/printful` alcanzan
  la aplicacion sin redireccion SSO.~~
  - Evidencia: un webhook Stripe test firmado respondio `200`; Printful sin
    credenciales devolvio `401`. El 8 de octubre un `order_created` autentico
    de Printful quedo `processed` en Firestore; ver seccion 5.
- [x] ~~Elegir `www.funnyteesforall.com` como canonico y redirigir el otro host.~~
  - Redirects HTTP/HTTPS 308 comprobados el 11 de octubre.
- [x] ~~Configurar `NEXT_PUBLIC_BASE_URL` con el dominio canonico en Vercel Production.~~
  - Valor publico exportado y URLs success/cancel de la sesion nueva coinciden.

## 3. Dependencias y seguridad

- [x] ~~Actualizar Next.js de `15.5.22` al parche `15.5.26` que corrige los
  avisos criticos conocidos y actualizar el lockfile.~~
  - Evidencia: PR
    [#17 — Update Next.js security patch](https://github.com/specialcowboy69/tienda-online-camisetas/pull/17),
    mergeado en `main` mediante `38c3e01`.
- [x] ~~Ejecutar `npm.cmd audit --omit=dev` despues de actualizar Next.js.~~
  - Evidencia: los dos avisos criticos de Next.js ya no aparecen y el resultado
    tiene `0 critical`.
- [x] ~~Resolver o aceptar explicitamente las vulnerabilidades productivas
  identificadas en la auditoria actual.~~
  - Estado historico tras PR
    [#18 — Upgrade Firebase Admin to 14.5.0](https://github.com/specialcowboy69/tienda-online-camisetas/pull/18):
    `3 high`, `4 moderate` y `0 critical`.
  - El 8 de octubre la persona propietaria acepto temporalmente los **9**
    hallazgos actuales (5 high, 4 moderate); [SECURITY.md](SECURITY.md)
    conserva el detalle y la tarea de correccion. La auditoria sigue fallando.
- [x] ~~Preparar, probar y mergear por separado la actualizacion de
  `firebase-admin` a `14.5.0`.~~
  - Evidencia: PR #18 mergeado mediante `6b885052`; Node requerido
    `>=22.12.0`; 96/96 tests, lint, TypeScript y build correctos.
  - Vercel desplego el commit exacto de `main` con Node.js `24.x` y Next.js
    `15.5.26`; el deployment quedo `Ready`.
  - En produccion, `/api/catalog`, `/`, `/products` y un PDP devolvieron `200`;
    admin y Printful sin credenciales devolvieron `401`; checkout vacio devolvio
    `400`.
  - No se usaron credenciales validas ni se crearon pedidos, sesiones de Stripe
    o escrituras de prueba.
- [ ] Verificar que no hay secretos reales versionados en Git.
  - Escaneo heuristico del 11 de octubre sin coincidencias en la muestra; limites
    y accesos administrativos comprobados en [SECURITY.md](SECURITY.md). No
    equivale a auditoria exhaustiva ni exige rotar secretos sin exposicion probada.
- [ ] Rotar los secretos de produccion que se hayan compartido o utilizado
  durante pruebas.
  - `ADMIN_SECRET`
  - `CRON_SECRET`
  - `PRINTFUL_API_TOKEN`
  - `PRINTFUL_WEBHOOK_SECRET`
  - Claves de Stripe, Firebase y Resend si procede.
- [ ] Confirmar que todos los endpoints administrativos siguen protegidos
  despues de retirar el SSO publico de Vercel.
- [x] ~~Ejecutar la verificacion obligatoria final sobre el resultado combinado
  de PR #18 y `main`.~~
  - [x] `npm.cmd test` — 96/96 tests.
  - [x] `npm.cmd run lint`.
  - [x] `npx.cmd tsc --noEmit --incremental false`.
  - [x] `npm.cmd run build` — Next.js `15.5.26`.

## 4. Paginas legales y atencion al cliente

- [ ] Crear y publicar la pagina de Privacy Policy.
- [ ] Crear y publicar la pagina de Terms and Conditions.
- [ ] Crear y publicar la pagina de Returns and Product Issues.
- [ ] Crear y publicar la pagina de Shipping Policy.
- [ ] Crear y publicar la pagina de Contact.
- [ ] Enlazar todas las paginas legales desde el footer.
- [ ] Confirmar que todos los textos visibles para clientes estan en ingles.
- [ ] Revisar legalmente los textos antes de aceptar pagos reales.
- [ ] Confirmar que `orders@funnyteesforall.com` puede recibir respuestas y
  solicitudes de devolucion.
- [ ] Completar en las plantillas la identidad legal del vendedor, los datos
  fiscales que correspondan, la direccion geografica de contacto y el canal
  real de soporte.
- [ ] Confirmar una direccion real y autorizada para devoluciones, su
  procedimiento y sus costes; no publicar la direccion de un centro de
  fulfillment como direccion de devolucion sin acuerdo operativo.
- [ ] Revisar todas las plantillas de `docs/legal-templates/`, completar las
  decisiones pendientes y eliminar todos los placeholders antes de publicar.
- [ ] Revisar legalmente las plantillas para Estados Unidos, Espana, Francia,
  Alemania, Italia y Portugal; preparar y revisar traducciones ES/FR/DE/IT/PT
  cuando sean exigibles para los mercados y el proceso de compra dirigidos.
  El borrador ingles no cierra esta tarea.
- [ ] Implementar y probar la funcion online de desistimiento exigible para
  contratos celebrados mediante una interfaz online desde el 19 de junio de
  2026; comprobar acceso durante el plazo legal, identificacion del contrato,
  confirmacion de envio y acuse en soporte duradero, conforme a la norma
  aplicable en cada mercado. Una pagina o un formulario modelo en PDF no
  sustituyen esta funcion.
- [ ] Incorporar el aviso armonizado de la UE sobre la garantia legal conforme
  al formato y calendario aplicables, incluidos los requisitos que se aplican
  desde el 27 de septiembre de 2026; revisar sus traducciones y ubicacion.
- [ ] Publicar las paginas revisadas y comprobar sus enlaces desde footer,
  checkout y emails, su acceso en movil y que el email publicado recibe una
  solicitud real de soporte o devolucion.

## 5. Configuracion de produccion

### Stripe

- [ ] Mantener Stripe en modo test y no activar Stripe Tax ni pagos live hasta
  cerrar la revision fiscal de las rutas, los paises y las importaciones.
- [ ] Activar y configurar Stripe en modo live.
- [ ] Configurar las claves live unicamente como variables de entorno de Vercel
  Production.
- [ ] Registrar el webhook live de Stripe en el dominio final.
- [ ] Configurar y verificar estos eventos:
  - [ ] `checkout.session.completed`
  - [ ] `checkout.session.async_payment_succeeded`
  - [ ] `checkout.session.async_payment_failed`
  - [ ] `checkout.session.expired`
  - [ ] `charge.refunded`
  - [ ] `refund.created`
  - [ ] `refund.updated`
  - [ ] `refund.failed`
- [ ] Confirmar que el secreto del webhook live coincide con el configurado en
  Vercel.

### Printful

- [ ] Confirmar el token y el Store ID de produccion.
- [ ] Confirmar que el metodo de pago o saldo de Printful puede cubrir pedidos
  reales.
- [x] ~~Registrar el webhook de Printful en el dominio final con su secreto.~~
  - 12 de octubre: configuracion leida antes/despues de registrar con #31;
    URL/secreto y nueve eventos intactos, IDs de catalogo de stock confirmados.
    Esto no cierra la prueba de recepcion de un evento nuevo.
- [x] ~~Comprobar la recepcion de un evento autentico de Printful sin
  fabricacion.~~
  - Borrador sintetico `179951879` con `confirm=0` y `order_created` procesado
    en `webhookEvents`; el borrador se cancelo. El evento de cancelacion no se
    observo; la prueba de producto posterior se documenta a continuacion. No
    acredita un envio real.
- [x] ~~Probar un evento real de actualizacion de producto o stock.~~
  - 12 de octubre: dos `product_updated` autenticos, `processed`, y cambio de
    identificador interno/restauracion verificados en Firestore. Sin cambios
    comerciales. [Evidencia](verification/2026-10-12-product-updated-live.md).
- [ ] Observar por separado un `stock_updated` autentico del proveedor y
  comprobar su efecto; no queda demostrado por la prueba de producto.
- [ ] Mantener `ORDER_CONFIRM_PRINTFUL=false` durante las pruebas previas a la
  compra real controlada.

### Firestore

- [ ] Confirmar que las credenciales de produccion apuntan al proyecto correcto.
- [ ] Confirmar que el catalogo publico contiene unicamente productos activos y
  no ignorados.
- [ ] Confirmar que precios, moneda, variantes, tallas e imagenes coinciden con
  Printful y el storefront.
- [ ] Confirmar trazabilidad en `orders`, `webhookEvents`, `syncRuns`,
  `emailJobs` y `orders/<id>/refunds`.

### Email

- [x] ~~Publicar los registros SPF, DKIM y MX necesarios para el subdominio de
  envio de Resend.~~
  - Evidencia: los registros de `send.funnyteesforall.com` y
    `resend._domainkey.funnyteesforall.com` resuelven publicamente.
- [x] ~~Comprobar que la configuracion efectiva de Resend permitio aceptar un
  email de confirmacion desde el deployment probado.~~
  - Evidencia: job `accepted` con un intento e ID del proveedor. Volver a
    comprobar la configuracion vigente antes de activar ventas live.
- [x] ~~Enviar y recibir correctamente un email transaccional de prueba.~~
  - Capturas de Gmail aportadas por la persona propietaria el 12 de octubre:
    confirmacion #8FA67DCC y prueba TEST ONLY de recuperacion del dia 11 en
    Recibidos. No acredita email de envio ni recepcion del canal de soporte.
- [ ] Confirmar que los emails de pedido y envio se muestran correctamente en
  movil y escritorio.
- [ ] Anadir un registro DMARC; empezar con una politica de observacion si
  todavia no hay datos suficientes.

## 6. Paises, envios y fiscalidad

- [x] ~~Decidir los paises iniciales previstos.~~
  - La decision de la persona propietaria es `US`, `ES`, `FR`, `DE`, `IT` y
    `PT`. La recomendacion anterior de empezar solo por Estados Unidos queda
    superada por esta decision; la revision fiscal y de rutas sigue pendiente.
- [ ] Confirmar la cobertura geografica admitida dentro de esos seis paises
  antes de abrir ventas live.
- [ ] Ajustar `ALLOWED_SHIPPING_COUNTRIES` a la decision final.
  - Una sesion Stripe test creada el 8 de octubre ofrecio tambien `CA` y `GB`
    ademas de los seis paises previstos. Es evidencia historica, anterior a #25
    y #26. La limpieza de la variable desplegada no se acredita en esta revision.
- [x] ~~Bloquear efectivamente Canada y Reino Unido en la aplicacion.~~
  - PR #26, merge `fed72dc`: filtro en servidor incluso si la variable los
    contiene. Smoke publico posterior a #27: ambos destinos devuelven 400.
  - PR #25, merge `1ff4891`: Stripe solo admite el pais usado para cotizar;
    la regla de tarifa CA/GB permanece inactiva, no autoriza reabrir destinos.
- [ ] Confirmar que las tarifas y plazos de envio mostrados coinciden con el
  comportamiento real de Printful.
- [ ] Confirmar que la politica de envio gratuito o incluido sigue siendo
  economicamente sostenible.
- [ ] Validar obligaciones fiscales y contables con una persona profesional
  — trabajo aplazado por decision de la persona propietaria, no resuelto.
- [x] ~~Decidir mantener Stripe Tax desactivado por ahora.~~
  - La sesion Stripe test creada el 8 de octubre registro
    `automatic_tax.enabled=false`; no se ha activado ni configurado Stripe Tax.
- [ ] Mantener `STRIPE_TAX_ENABLED=false` hasta cerrar la revision fiscal y
  volver a verificar el valor antes de la compra live.
- [ ] Revisar la [matriz interna de fulfillment](legal-templates/printful-fulfillment-matrix.md)
  contra el catalogo y las rutas reales: disponibilidad regional, stock y
  tecnica no garantizan una fabrica ni un pais de expedicion.
- [ ] Confirmar por ruta y pedido el pais de expedicion, importador,
  obligaciones de IVA/OSS/IOSS, aduanas, transportista y cargos de importacion;
  distinguir la compra a Printful de la venta al cliente. No prometer DDP ni
  ausencia de cargos de importacion en la UE sin confirmacion de la ruta.
- [ ] Validar con una persona profesional el tratamiento fiscal y aduanero de
  las variantes disponibles solo en Estados Unidos cuando se vendan a
  `ES`, `FR`, `DE`, `IT` o `PT`, y reflejar los costes y responsabilidades
  confirmados en checkout, politicas y emails.

### Control preventivo aduanero UE — 2026-10-11

- [x] ~~Implementar el control por metodo/paquete para ES/FR/DE/IT/PT.~~
  - Verificacion local: 477 tests, lint, TypeScript y build correctos; sin
    dependencias nuevas ni cambios en fulfillment, impuestos o credenciales.
  - US conserva el flujo sin v2. CA/GB se rechazan por codigo antes del
    proveedor aunque la variable desplegada aun los contenga; esto no marca
    como actualizado el pendiente historico de ALLOWED_SHIPPING_COUNTRIES.
- [x] ~~Renovar cotizaciones reales sin pagos ni pedidos.~~
  - Standard incluido para una seleccion apta en los seis destinos; True Navy M
    y carrito mixto rechazados para ES. Ver la
    [matriz fechada](legal-templates/printful-fulfillment-matrix.md#comprobacion-dinamica-2026-10-11).
  - La crop muestreada no admite la consulta DTF v2 actual: fallo de comprobacion,
    no evidencia suficiente para afirmar aduanas. No se fuerza tecnica distinta.
- [x] ~~Completar revision visual local a 390x844 y 1440x900.~~
  - Seleccion apta, riesgo, servicio no disponible, respuesta lenta invalidada
    por direccion/pais y retorno a US. Respuestas interceptadas en navegador;
    alertas legibles sin desbordamiento, tabulacion comprobada, direccion
    conservada y pago retirado tras invalidar. Ningun checkout llego al servidor.
  - La consola solo mostro los errores HTTP simulados y un favicon 404 previo,
    ajeno al control de compra.
- [x] ~~Completar revision independiente de esta implementacion.~~
  - Revision de los 24 archivos de `fed72dc..8084dc4`, sin hallazgos criticos,
    importantes ni menores. 13 comprobaciones adicionales en memoria de parser
    y politica correctas; no reemplazan las pruebas del ejecutor.
  - HTTP local con Firestore/Printful reales: seleccion apta ES devuelve 200 y
    STANDARD 0.00; True Navy M devuelve 409 EU_CUSTOMS_RISK. Sin checkout/pagos.
  - Snapshot anterior a publicar #27: cero PR abiertos y solo
    `codex/eu-customs-guard` con commits fuera de origin/main. Entonces no se
    habia hecho push, merge ni deployment. Se conserva como antecedente;
    el cierre posterior esta registrado a continuacion.
- [x] ~~Integrar por PR y comprobar cotizacion publica en el deployment exacto.~~
  - Evidencia: [PR #27](https://github.com/specialcowboy69/tienda-online-camisetas/pull/27)
    `MERGED` el 11 de octubre, SHA `929a72583cca395cc1027a503dae2c9f4ed502f9`
    contenido en `origin/main`, conservando los seis commits.
  - Vercel Production `Ready`: deployment `dpl_CrSpQJxUieUtBRcGF1JTGyAXFCU6`,
    [registro del despliegue](https://vercel.com/specialcowboy69s-projects/tienda-online-camisetas/CrSpQJxUieUtBRcGF1JTGyAXFCU6),
    servido por `www.funnyteesforall.com` en la comprobacion posterior al merge.
  - Sobre el head revisado `3deb914`: 477 tests, lint, TypeScript y build
    correctos; el arbol del merge no difiere de ese head.
  - Smoke publico: `/`, `/products` y
    `/products/falling-apart-cat-graphic-tee` devolvieron 200. En
    `/api/shipping/rates`, Falling apart Black S (`5489215132`) a ES devolvio
    200 y STANDARD 0.00 USD; True Navy M (`5489218795`) a ES devolvio
    409 `EU_CUSTOMS_RISK`; CA y GB devolvieron 400.
  - Solo lecturas y cotizaciones: no se crearon sesiones Stripe, pedidos,
    emails, reembolsos ni fabricacion. Esta muestra publica no acredita todas
    las variantes/destinos ni una compra posterior a #27.
- [ ] Renovar rutas/cobertura antes del lanzamiento. El control previo a Stripe
  no garantiza ruta final ni detecta automaticamente cambios posteriores al pago.

## 7. Prueba integral antes de abrir

### Compra de prueba

- [ ] Abrir publicamente la home, `/products` y cada PDP.
- [ ] Comprobar imagenes, precios, colores, tallas y disponibilidad con datos
  reales.
- [ ] Anadir variantes diferentes al carrito.
- [ ] Calcular el envio con una direccion admitida.
- [x] ~~Completar un checkout de Stripe en modo test.~~
  - Evidencia: Checkout completo y pagado, `livemode=false`, importe de
    USD 39.99 y `automatic_tax=false` en la sesion consultada.
- [x] ~~Confirmar la creacion del pedido en Firestore.~~
  - Evidencia: pago, importe, moneda y asociacion con la sesion Stripe
    validados en el pedido de prueba.
- [x] ~~Confirmar el procesamiento del evento de pago en `webhookEvents`.~~
  - Evidencia: `checkout.session.completed` procesado tras webhook `200`.
- [x] ~~Confirmar la creacion del pedido draft en Printful.~~
  - Evidencia: consulta directa al proveedor devolvio el mismo ID externo y
    estado `draft`; esto comprobo el comportamiento seguro de la prueba, sin
    confirmar fabricacion.
- [x] ~~Confirmar que el job de email de pedido fue aceptado por el proveedor.~~
  - Evidencia: `emailJobs` registro `accepted`, un intento y un ID del proveedor.
- [x] ~~Comprobar entrega y visualizacion en bandeja de los dos emails de prueba.~~
  - Capturas de Gmail del propietario, verificadas el 12 de octubre; ver evidencia.
- [ ] Comprobar rebotes y entrega/visualizacion de un email de envio.
- [x] ~~Probar la pagina de exito despues del pago test.~~
  - Evidencia: `/success` respondio `200`, mostro el estado de pago recibido y
    la URL de retorno no expuso el ID interno del pedido.
- [x] ~~Probar visualmente la pagina de cancelacion.~~
  - `/cancel` revisada en movil/escritorio el 11 de octubre por acceso directo;
    no se confunde con cancelar un pago. Expiraciones conservan prueba anterior.
- [x] ~~Probar un reembolso completo en Stripe test y su reconciliacion.~~
  - Evidencia: Stripe y Firestore registraron el importe completo reembolsado;
    `refundSummary.status=full`. Un `503` temporal por eventos concurrentes se
    resolvio al reenviar el mismo evento, que quedo `processed`.
- [x] ~~Probar un reembolso parcial en Stripe test y su reconciliacion.~~
  - Evidencia: un solo refund de 500 centavos sobre 3999, recibo canonico,
    `refundSummary.status=partial` y bloqueo de fulfillment. Un
    `refund.updated` ocupado quedo `processed` tras replay del mismo ID.
- [x] ~~Probar un reembolso `pending` autentico de Stripe con tarjeta de prueba.~~
  - El 11 de octubre: pending real, Firestore no lo conto como completado;
    posteriormente succeeded y full por 3999 centavos, un solo refund.
- [x] ~~Revisar y cancelar el borrador remoto de la prueba reembolsada con permiso.~~
  - `179691582` y el nuevo `180436734`: canceled confirmado por API el 11 de
    octubre, cero envios, registros financieros y emails conservados.
    No se recibio evento de cancelacion; snapshot local puede seguir draft.

### Compra real controlada

**Aplazada por decision de la persona propietaria.** No programada ni autorizada
por esta actualizacion; requiere permiso nuevo al retomarla y sigue sin verificar.

- [ ] Activar temporalmente `ORDER_CONFIRM_PRINTFUL=true` para la prueba real
  acordada.
- [ ] Realizar una compra real de bajo coste con una direccion controlada.
- [ ] Confirmar el cobro live en Stripe.
- [ ] Confirmar el pedido y la fabricacion en Printful.
- [ ] Confirmar la actualizacion del estado mediante webhook.
- [ ] Confirmar los emails de pedido y envio.
- [ ] Confirmar que el tracking llega al pedido y al cliente.
- [ ] Mantener `ORDER_CONFIRM_PRINTFUL=true` solo cuando el flujo completo haya
  pasado correctamente y se quiera automatizar el fulfillment.

## 8. SEO, medicion y operaciones

- [ ] Crear `robots.txt` y el sitemap publico.
- [ ] Anadir `metadataBase`, canonical, Open Graph y Twitter metadata.
- [ ] Confirmar metadatos unicos para cada producto.
- [ ] Configurar Search Console y enviar el sitemap.
- [x] Elegir GA4 e implementar consentimiento previo y retirada en #35,
  desplegado apagado; evidencia y límites en la sección de analítica opcional.
- [ ] Completar las puertas de activación de GA4 (legales, propiedad, SDK real
  y recepción verificada); Google Ads queda fuera del alcance implementado.
- [ ] Configurar monitorizacion de errores y revisar logs de Vercel.
- [x] ~~Definir una revision periodica manual para pedidos en `manual_review`,
  webhooks fallidos y solicitudes de clientes.~~
  - Procedimiento, responsables y escalado en [operations.md](operations.md).
    Alertas integradas y desplegadas en #29, desactivadas. Su configuracion,
    activacion y comprobacion remota siguen pendientes. La vigilancia manual se conserva.
- [ ] Planificar un rate limit compartido antes de escalar a multiples instancias
  o trafico relevante.
- [x] ~~Documentar quien revisa pedidos, devoluciones, emails y fallos de
  fulfillment.~~
  - La persona propietaria toma las decisiones y ejecuta acciones financieras;
    Codex ayuda a investigar y verificar cuando se le convoca. Ver
    [operations.md](operations.md).

## 9. Revision final y decision GO/NO-GO

- [ ] Revisar accesibilidad: teclado, foco, contraste, textos alternativos y
  modales.
- [ ] Revisar rendimiento y estabilidad visual en movil y escritorio.
- [ ] Probar Chrome, Safari y Firefox en los dispositivos disponibles.
- [ ] Verificar que no aparecen textos de desarrollo, placeholders ni datos
  inventados.
- [ ] Preparar un rollback hacia el deployment estable anterior de Vercel.
  - Candidato historico identificado en la evidencia del 11/12 de octubre; no
    ensayado. Revalidar compatibilidad, variables y aislamiento antes de usarlo.
    La metadata de Preview compartida no demuestra un sandbox seguro.
- [ ] Confirmar que existe una persona responsable de vigilar el primer dia de
  ventas.
- [ ] Realizar la revision final de esta checklist.
- [ ] Cambiar el estado global de este documento a `GO`.
- [ ] Abrir la tienda y comenzar el lanzamiento publico.

## Criterio minimo para declarar `GO`

La tienda solo esta lista para aceptar pagos reales cuando se cumplen
simultaneamente estos puntos:

- [ ] El storefront es publico y no esta bloqueado por Vercel SSO.
- [ ] Los webhooks de Stripe y Printful llegan a la aplicacion.
- [ ] No quedan vulnerabilidades criticas o altas sin resolver o aceptar
  explicitamente.
- [ ] Las paginas legales y el canal de soporte estan publicados.
- [ ] La identidad, contacto y direccion de devolucion son reales; las
  plantillas no contienen placeholders, han recibido revision legal y cuentan
  con las traducciones, funcion de desistimiento y aviso de garantia exigibles.
- [ ] Stripe, Printful, Firestore y Resend estan configurados y probados en
  produccion.
- [ ] La decision fiscal y los paises admitidos estan cerrados.
- [ ] Las rutas de fulfillment e importacion para `US`, `ES`, `FR`, `DE`,
  `IT` y `PT` estan confirmadas; se han cerrado IVA/OSS/IOSS y aduanas antes
  de habilitar Stripe Tax o pagos live.
- [ ] Una compra real controlada ha completado todo el recorrido correctamente.
- [ ] Existe un procedimiento de monitorizacion, devolucion y rollback.
