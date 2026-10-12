# Checklist de lanzamiento — No Context Club

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../LAUNCH_CHECKLIST.md).


Este documento es la lista operativa para lanzar la tienda con ventas reales. Se actualizará cada vez que terminemos y verifiquemos una tarea.

**Estado global:** `NO-GO — todavía no aceptar pagos reales`

**Última revisión:** 28 de septiembre de 2026

## Cómo actualizar esta lista

- `[ ]` significa pendiente o todavía no verificado.
- `[x] ~~Texto~~` significa terminado y comprobado con evidencia.
- Una tarea no se marca como terminada solo porque esté configurada: debe probarse en el entorno correspondiente.
- La evidencia puede ser un Pull Request, un deployment, una captura del proveedor, un evento registrado o el resultado de una prueba.
- No se deben guardar secretos, tokens ni valores sensibles en este documento.

## 1. Integración y despliegue del storefront

- [x] ~~Desarrollar el rediseño de la home y `/products` en una rama de feature.~~
  - Evidencia: PR [#16 — Redesign No Context Club home and products](https://github.com/specialcowboy69/tienda-online-camisetas/pull/16).
- [ ] Revisar y mergear el PR #16 contra `main`.
- [ ] Confirmar que Vercel ha desplegado el commit mergeado desde `main`.
- [ ] Revisar visualmente home y `/products` en producción, tanto en escritorio como en móvil.
- [ ] Confirmar que el PDP y el checkout no han sufrido regresiones tras el despliegue.

## 2. Acceso público y dominio

- [x] ~~Conectar `funnyteesforall.com` y `www.funnyteesforall.com` con Vercel.~~
  - Evidencia: ambos dominios alcanzan actualmente la plataforma de Vercel.
- [ ] Desactivar la protección SSO de Vercel para el deployment de producción.
- [ ] Confirmar que `https://www.funnyteesforall.com` devuelve la tienda pública y no una pantalla de acceso de Vercel.
- [ ] Confirmar que `/products` y una página individual de producto responden públicamente.
- [ ] Confirmar que `/api/webhooks/stripe` y `/api/webhooks/printful` alcanzan la aplicación sin redirección SSO.
- [ ] Elegir el dominio canónico —recomendado: `www.funnyteesforall.com`— y redirigir el otro dominio hacia él.
- [ ] Configurar `NEXT_PUBLIC_BASE_URL` con el dominio canónico en Vercel Production.

## 3. Dependencias y seguridad

- [x] ~~Actualizar Next.js de `15.5.22` a la versión segura `15.5.26` y actualizar el lockfile.~~
  - Evidencia: PR [#17 — Update Next.js security patch](https://github.com/specialcowboy69/tienda-online-camisetas/pull/17), mergeado en `main` mediante `38c3e01`.
- [x] ~~Ejecutar `npm.cmd audit --omit=dev` después de actualizar Next.js.~~
  - Evidencia: los dos avisos críticos de Next.js ya no aparecen y el resultado tiene `0 critical`.
- [ ] Resolver o aceptar explícitamente todas las vulnerabilidades productivas restantes.
  - Estado tras PR [#18 — Upgrade Firebase Admin to 14.5.0](https://github.com/specialcowboy69/tienda-online-camisetas/pull/18): `3 high` y `4 moderate`.
  - Aceptado solo para abrir el PR: residual `firebase-admin -> @google-cloud/storage -> gaxios -> uuid`; está documentado como no alcanzable por el uso actual, pero no queda aprobado automáticamente para merge o producción.
  - Siguen pendientes de resolución o aceptación explícita los demás avisos de `nanoid`, `postcss`/Next.js, `sharp` y `qs`.
- [x] ~~Preparar y probar por separado la actualización de `firebase-admin` a `14.5.0`.~~
  - Evidencia: PR #18; Node requerido `>=22.12.0`; tests `75/75`, lint, TypeScript y build correctos; sin cambios en código de producción.
  - Preview verificado mediante Vercel CLI: proyecto configurado con Node.js `24.x`; `/api/catalog`, `/`, `/products` y un PDP devolvieron `200`; admin, sync y webhook sin credenciales devolvieron `401`; checkout vacío devolvió `400`.
  - No se usaron credenciales válidas ni se crearon pedidos, sesiones de Stripe o escrituras de prueba. El PR continúa abierto y sin mergear.
- [ ] Verificar que no hay secretos reales versionados en Git.
- [ ] Rotar los secretos de producción que se hayan compartido o utilizado durante pruebas.
  - `ADMIN_SECRET`
  - `CRON_SECRET`
  - `PRINTFUL_API_TOKEN`
  - `PRINTFUL_WEBHOOK_SECRET`
  - Claves de Stripe, Firebase y Resend si procede.
- [ ] Confirmar que los endpoints administrativos siguen protegidos después de retirar el SSO público de Vercel.
- [ ] Ejecutar la verificación obligatoria final:
  - [ ] `npm.cmd test`
  - [ ] `npm.cmd run lint`
  - [ ] `npx.cmd tsc --noEmit --incremental false`
  - [ ] `npm.cmd run build`

## 4. Páginas legales y atención al cliente

- [ ] Crear y publicar la página de Privacy Policy.
- [ ] Crear y publicar la página de Terms and Conditions.
- [ ] Crear y publicar la página de Returns and Product Issues.
- [ ] Crear y publicar la página de Shipping Policy.
- [ ] Crear y publicar la página de Contact.
- [ ] Enlazar todas las páginas legales desde el footer.
- [ ] Confirmar que todos los textos visibles para clientes están en inglés.
- [ ] Revisar legalmente los textos antes de aceptar pagos reales.
- [ ] Confirmar que `orders@funnyteesforall.com` puede recibir respuestas y solicitudes de devolución.

## 5. Configuración de producción

### Stripe

- [ ] Activar y configurar Stripe en modo live.
- [ ] Configurar las claves live únicamente como variables de entorno de Vercel Production.
- [ ] Registrar el webhook live de Stripe en el dominio final.
- [ ] Configurar y verificar estos eventos:
  - [ ] `checkout.session.completed`
  - [ ] `checkout.session.async_payment_succeeded`
  - [ ] `checkout.session.async_payment_failed`
  - [ ] `checkout.session.expired`
  - [ ] `charge.refunded`
  - [ ] `refund.updated`
- [ ] Confirmar que el secreto del webhook live coincide con el configurado en Vercel.

### Printful

- [ ] Confirmar el token y el Store ID de producción.
- [ ] Confirmar que el método de pago o saldo de Printful puede cubrir pedidos reales.
- [ ] Registrar el webhook de Printful en el dominio final con su secreto.
- [ ] Probar un evento real de actualización de producto o stock.
- [ ] Mantener `ORDER_CONFIRM_PRINTFUL=false` durante las pruebas previas a la compra real controlada.

### Firestore

- [ ] Confirmar que las credenciales de producción apuntan al proyecto correcto.
- [ ] Confirmar que el catálogo público contiene únicamente productos activos y no ignorados.
- [ ] Confirmar que precios, moneda, variantes, tallas e imágenes coinciden con Printful y el storefront.
- [ ] Confirmar trazabilidad en `orders`, `webhookEvents` y `syncRuns`.

### Email

- [x] ~~Publicar los registros SPF, DKIM y MX necesarios para el subdominio de envío de Resend.~~
  - Evidencia: los registros de `send.funnyteesforall.com` y `resend._domainkey.funnyteesforall.com` resuelven públicamente.
- [ ] Configurar `RESEND_API_KEY` y `RESEND_FROM_EMAIL` en Vercel Production.
- [ ] Enviar y recibir correctamente un email transaccional de prueba.
- [ ] Confirmar que los emails de pedido y envío se muestran correctamente en móvil y escritorio.
- [ ] Añadir un registro DMARC; empezar con una política de observación si todavía no hay datos suficientes.

## 6. Países, envíos y fiscalidad

- [ ] Decidir y documentar los países del lanzamiento inicial.
  - Recomendación operativa: empezar solo con Estados Unidos hasta validar el resto de mercados.
- [ ] Ajustar `ALLOWED_SHIPPING_COUNTRIES` a la decisión final.
- [ ] Confirmar que las tarifas y plazos de envío mostrados coinciden con el comportamiento real de Printful.
- [ ] Confirmar que la política de envío gratuito o incluido sigue siendo económicamente sostenible.
- [ ] Validar obligaciones fiscales y contables con una persona profesional.
- [ ] Decidir si se utilizará Stripe Tax.
- [ ] Mantener `STRIPE_TAX_ENABLED=false` hasta haber cerrado la decisión fiscal.

## 7. Prueba integral antes de abrir

### Compra de prueba

- [ ] Abrir públicamente la home, `/products` y cada PDP.
- [ ] Comprobar imágenes, precios, colores, tallas y disponibilidad con datos reales.
- [ ] Añadir variantes diferentes al carrito.
- [ ] Calcular el envío con una dirección admitida.
- [ ] Completar un checkout de Stripe en modo test.
- [ ] Confirmar la creación del pedido en Firestore.
- [ ] Confirmar el procesamiento del evento en `webhookEvents`.
- [ ] Confirmar la creación del pedido draft en Printful.
- [ ] Confirmar el email de pedido.
- [ ] Probar las páginas de éxito y cancelación.
- [ ] Probar un reembolso o cancelación controlados y documentar el procedimiento.

### Compra real controlada

- [ ] Activar temporalmente `ORDER_CONFIRM_PRINTFUL=true` para la prueba real acordada.
- [ ] Realizar una compra real de bajo coste con una dirección controlada.
- [ ] Confirmar el cobro live en Stripe.
- [ ] Confirmar el pedido y la fabricación en Printful.
- [ ] Confirmar la actualización del estado mediante webhook.
- [ ] Confirmar los emails de pedido y envío.
- [ ] Confirmar que el tracking llega al pedido y al cliente.
- [ ] Mantener `ORDER_CONFIRM_PRINTFUL=true` solo cuando el flujo completo haya pasado correctamente y se quiera automatizar el fulfillment.

## 8. SEO, medición y operaciones

- [ ] Crear `robots.txt` y el sitemap público.
- [ ] Añadir `metadataBase`, canonical, Open Graph y Twitter metadata.
- [ ] Confirmar metadatos únicos para cada producto.
- [ ] Configurar Search Console y enviar el sitemap.
- [ ] Decidir la herramienta de analítica.
- [ ] Implementar consentimiento si la medición utiliza cookies que lo requieran.
- [ ] Configurar monitorización de errores y revisar logs de Vercel.
- [ ] Definir alertas o revisión periódica para pedidos en `manual_review` y webhooks fallidos.
- [ ] Planificar un rate limit compartido antes de escalar a múltiples instancias o tráfico relevante.
- [ ] Documentar quién revisa pedidos, devoluciones, emails y fallos de fulfillment.

## 9. Revisión final y decisión GO/NO-GO

- [ ] Revisar accesibilidad: teclado, foco, contraste, textos alternativos y modales.
- [ ] Revisar rendimiento y estabilidad visual en móvil y escritorio.
- [ ] Probar Chrome, Safari y Firefox en los dispositivos disponibles.
- [ ] Verificar que no aparecen textos de desarrollo, placeholders ni datos inventados.
- [ ] Preparar un rollback hacia el deployment estable anterior de Vercel.
- [ ] Confirmar que existe una persona responsable de vigilar el primer día de ventas.
- [ ] Realizar la revisión final de esta checklist.
- [ ] Cambiar el estado global de este documento a `GO`.
- [ ] Abrir la tienda y comenzar el lanzamiento público.

## Criterio mínimo para declarar `GO`

La tienda solo está lista para aceptar pagos reales cuando se cumplen simultáneamente estos puntos:

- [ ] El storefront es público y no está bloqueado por Vercel SSO.
- [ ] Los webhooks de Stripe y Printful llegan a la aplicación.
- [ ] No quedan vulnerabilidades críticas o altas sin resolver o aceptar explícitamente.
- [ ] Las páginas legales y el canal de soporte están publicados.
- [ ] Stripe, Printful, Firestore y Resend están configurados y probados en producción.
- [ ] La decisión fiscal y los países admitidos están cerrados.
- [ ] Una compra real controlada ha completado todo el recorrido correctamente.
- [ ] Existe un procedimiento de monitorización, devolución y rollback.
