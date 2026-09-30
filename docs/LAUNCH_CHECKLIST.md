# Checklist de lanzamiento — No Context Club

Este documento es la lista operativa para lanzar la tienda con ventas reales.
Se actualiza cada vez que una tarea queda terminada y verificada.

**Estado global:** `NO-GO — todavía no aceptar pagos reales`

**Ultima revision:** 30 de septiembre de 2026

## Seguridad de pedidos: alcance de esta revision

Prueba local en `codex/order-safety-and-refunds`: validacion de pago/direccion,
propiedad de eventos y pedidos, recuperacion Printful con identidad estable,
email durable y reconciliacion canonica de reembolsos. Las regresiones combinadas
usan servicios reales del codigo y transportes sinteticos. La comprobacion visual
local usa componentes reales y APIs interceptadas en escritorio/movil.
Esto no confirma aceptacion/entrega real de proveedores ni cambia el NO-GO.

- [ ] Revision independiente de la rama completa y sus interfaces.
- [ ] Integrar solo el SHA revisado tras inventario AGENTS; autorizar despliegue.
- [ ] Parar y drenar workers anteriores sin fencing antes del despliegue/reanudacion.
- [ ] Confirmar los ocho eventos Stripe primero en test, sin backfill masivo.
- [ ] Prueba sandbox del flujo completo, eventos concurrentes/repetidos,
  reembolso parcial y pending, recuperacion de emails y lease busy 503.
- [ ] Verificar entrega de email/rebotes por separado de aceptacion Resend.
- [ ] Revisar legacy sin jobs, confirmaciones faltantes y cutoff de 23 horas,
  sin mensajes historicos automaticos; asignar responsable de recuperacion.
- [ ] Revisar procedimiento de reembolso manual Stripe y cancelacion Printful
  por separado; no desbloquear latches ni estados terminales mediante Retry.
- [ ] Resolver o aceptar advisories pendientes antes de GO; audit local sigue
  documentando 7 hallazgos baseline (4 moderate, 3 high), sin upgrades ni --force.
- [ ] Compra real controlada y autorizada, monitorizacion y rollback verificados.

Detalles operativos en [operations.md](operations.md) y despliegue seguro en
[DEPLOYMENT.md](DEPLOYMENT.md). No marcar compras, webhooks remotos ni entrega de
correo como realizadas basandose en mocks, capturas locales o build.

## Como actualizar esta lista

- `[ ]` significa pendiente o todavia no verificado.
- `[x] ~~Texto~~` significa terminado y comprobado con evidencia.
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
- [ ] Revisar visualmente home y `/products` en produccion, tanto en escritorio
  como en movil.
- [ ] Confirmar funcionalmente que el PDP y el checkout no han sufrido
  regresiones tras el despliegue. El smoke test HTTP esta correcto, pero no
  sustituye una compra de prueba.

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
- [ ] Confirmar que `/api/webhooks/stripe` y `/api/webhooks/printful` alcanzan
  la aplicacion sin redireccion SSO.
  - Verificado parcialmente: Printful sin credenciales devolvio `401`, lo que
    confirma que alcanza la aplicacion. Stripe sigue pendiente de una prueba
    controlada.
- [ ] Elegir el dominio canonico —recomendado: `www.funnyteesforall.com`— y
  redirigir el otro dominio hacia el.
- [ ] Configurar `NEXT_PUBLIC_BASE_URL` con el dominio canonico en Vercel
  Production.

## 3. Dependencias y seguridad

- [x] ~~Actualizar Next.js de `15.5.22` al parche `15.5.26` que corrige los
  avisos criticos conocidos y actualizar el lockfile.~~
  - Evidencia: PR
    [#17 — Update Next.js security patch](https://github.com/specialcowboy69/tienda-online-camisetas/pull/17),
    mergeado en `main` mediante `38c3e01`.
- [x] ~~Ejecutar `npm.cmd audit --omit=dev` despues de actualizar Next.js.~~
  - Evidencia: los dos avisos criticos de Next.js ya no aparecen y el resultado
    tiene `0 critical`.
- [ ] Resolver o aceptar explicitamente todas las vulnerabilidades productivas
  restantes.
  - Estado tras PR
    [#18 — Upgrade Firebase Admin to 14.5.0](https://github.com/specialcowboy69/tienda-online-camisetas/pull/18):
    `3 high`, `4 moderate` y `0 critical`.
  - Aceptado para el merge y su despliegue automatico: residual
    `firebase-admin -> @google-cloud/storage -> gaxios -> uuid`, documentado
    como exposicion limitada por el uso actual.
  - Siguen pendientes de resolucion o aceptacion explicita los avisos de
    `nanoid`, `postcss`/Next.js, `sharp` y `qs`.
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
- [ ] Registrar el webhook de Printful en el dominio final con su secreto.
- [ ] Probar un evento real de actualizacion de producto o stock.
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
- [ ] Configurar `RESEND_API_KEY` y `RESEND_FROM_EMAIL` en Vercel Production.
- [ ] Enviar y recibir correctamente un email transaccional de prueba.
- [ ] Confirmar que los emails de pedido y envio se muestran correctamente en
  movil y escritorio.
- [ ] Anadir un registro DMARC; empezar con una politica de observacion si
  todavia no hay datos suficientes.

## 6. Paises, envios y fiscalidad

- [ ] Decidir y documentar los paises del lanzamiento inicial.
  - Recomendacion operativa: empezar solo con Estados Unidos hasta validar el
    resto de mercados.
  - Alcance de las plantillas preparadas el 29 de septiembre de 2026:
    Estados Unidos (`US`), Espana (`ES`), Francia (`FR`), Alemania (`DE`),
    Italia (`IT`) y Portugal (`PT`). Este alcance no confirma la apertura ni
    sustituye la decision final pendiente; la recomendacion anterior queda
    conservada como antecedente operativo.
- [ ] Confirmar expresamente el lanzamiento en `US`, `ES`, `FR`, `DE`, `IT`
  y `PT` y la cobertura geografica admitida dentro de cada pais antes de
  ajustar la configuracion.
- [ ] Ajustar `ALLOWED_SHIPPING_COUNTRIES` a la decision final.
- [ ] Confirmar que las tarifas y plazos de envio mostrados coinciden con el
  comportamiento real de Printful.
- [ ] Confirmar que la politica de envio gratuito o incluido sigue siendo
  economicamente sostenible.
- [ ] Validar obligaciones fiscales y contables con una persona profesional.
- [ ] Decidir si se utilizara Stripe Tax.
- [ ] Mantener `STRIPE_TAX_ENABLED=false` hasta haber cerrado la decision fiscal.
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

## 7. Prueba integral antes de abrir

### Compra de prueba

- [ ] Abrir publicamente la home, `/products` y cada PDP.
- [ ] Comprobar imagenes, precios, colores, tallas y disponibilidad con datos
  reales.
- [ ] Anadir variantes diferentes al carrito.
- [ ] Calcular el envio con una direccion admitida.
- [ ] Completar un checkout de Stripe en modo test.
- [ ] Confirmar la creacion del pedido en Firestore.
- [ ] Confirmar el procesamiento del evento en `webhookEvents`.
- [ ] Confirmar la creacion del pedido draft en Printful.
- [ ] Confirmar el email de pedido.
- [ ] Probar las paginas de exito y cancelacion.
- [ ] Probar un reembolso o cancelacion controlados y documentar el
  procedimiento.

### Compra real controlada

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
- [ ] Decidir la herramienta de analitica.
- [ ] Implementar consentimiento si la medicion utiliza cookies que lo requieran.
- [ ] Configurar monitorizacion de errores y revisar logs de Vercel.
- [ ] Definir alertas o revision periodica para pedidos en `manual_review` y
  webhooks fallidos.
- [ ] Planificar un rate limit compartido antes de escalar a multiples instancias
  o trafico relevante.
- [ ] Documentar quien revisa pedidos, devoluciones, emails y fallos de
  fulfillment.

## 9. Revision final y decision GO/NO-GO

- [ ] Revisar accesibilidad: teclado, foco, contraste, textos alternativos y
  modales.
- [ ] Revisar rendimiento y estabilidad visual en movil y escritorio.
- [ ] Probar Chrome, Safari y Firefox en los dispositivos disponibles.
- [ ] Verificar que no aparecen textos de desarrollo, placeholders ni datos
  inventados.
- [ ] Preparar un rollback hacia el deployment estable anterior de Vercel.
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
