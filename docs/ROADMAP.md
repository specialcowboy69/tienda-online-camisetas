# Roadmap

Revision documental: 11 de octubre de 2026. Esta guia ordena el trabajo;
[LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) es la referencia de estados, decisiones
aplazadas y evidencia fechada. Mantener `NO-GO` hasta cerrar sus criterios.

## Estado actual

La tienda ya tiene una base funcional:

- Catalogo sincronizado desde Printful.
- Carrito y checkout con Stripe.
- Pedidos guardados en Firestore.
- Webhook de Stripe con idempotencia.
- Webhook de Printful protegido.
- Emails transaccionales con Resend si esta configurado.
- Panel admin basico.
- Rate limiting y validacion en endpoints publicos.
- Tests de logica critica.
- Productos ignorados por Printful ocultos en catalogo publico.
- Payload limpio de carrito para shipping y checkout.
- Moneda de venta gestionada desde Printful y reflejada en variantes activas sincronizadas.
- Reconciliacion de catalogo: productos ausentes de Printful se marcan como `isIgnored` en Firestore.
- Envio Standard incluido para US, ES, FR, DE, IT y PT. CA y GB bloqueados temporalmente hasta validar DDP; Printful Fast incluido solo para US.
- Control preventivo UE por metodo/paquete integrado y desplegado (#27):
  riesgo o evidencia no verificable impiden iniciar pago. No garantiza ruta final.
- Seguridad de pedidos, recuperacion de email y reembolsos integrados (#21-#23),
  con pruebas controladas posteriores documentadas en la checklist.
- Imagenes manuales de storefront con prioridad sobre imagenes de Printful.
- Experiencia publica English-first: tienda, success/cancel, emails y locale de envio Printful en ingles.

## Decisiones cerradas

- La moneda de tienda debe cambiarse desde Printful/storefront settings. La aplicacion consume la moneda sincronizada por variante y no debe anadir un override propio salvo necesidad futura.
- Los productos borrados de Printful se conservan en Firestore como historico con `isIgnored`, no se borran fisicamente de forma automatica.
- Las reglas de envio incluido viven en servidor y se recalculan durante checkout.
- El idioma publico por defecto es ingles. La documentacion interna puede seguir en espanol.
- Stripe Tax permanece desactivado. Los paises acordados son US/ES/FR/DE/IT/PT;
  no reabrir CA/GB ni cambiar la politica de envio por una limpieza documental.

## Pasos por delante

### 1. Webhook de Printful hacia Vercel

Estado: protegido y con un evento autentico `order_created` registrado como
`processed` el 8 de octubre. Ese borrador sintetico se cancelo sin fabricacion;
no se observo el evento de cancelacion. La evidencia no cubre envio real ni
una prueba dedicada de actualizacion de producto/stock.

Objetivo: cambiar algo en Printful y confirmar que `/api/webhooks/printful` actualiza Firestore.

Resultado esperado:

- Evento registrado en `webhookEvents`.
- Pedido o catalogo actualizado en Firestore.
- No hay errores silenciosos.

### 2. Resend para emails transaccionales

Estado: integrado con jobs durables; registros de dominio y aceptacion de un
email por el proveedor documentados. Entrega en bandeja aplazada por decision
de la persona propietaria; no declarar entregado a partir de `accepted`.

Objetivo: asegurar emails de confirmacion, envio y estados importantes.

Resultado esperado:

- Dominio verificado en Resend.
- `RESEND_FROM_EMAIL` con remitente real.
- Emails probados en modo controlado.

Pendientes concretos: entrega/rebotes, visualizacion y recuperacion real de jobs;
no repetir el alta del dominio sin comprobar primero su configuracion vigente.

### 3. Textos visibles y tono de marca

Estado: base English-first implementada. Queda pulir tono, mensajes legales y consistencia cuando crezca la tienda.

Objetivo: mantener tienda, checkout-facing copy, marca y emails en ingles claro y con personalidad `No Context Club`.

Incluye:

- Botones.
- Mensajes de error.
- Mensajes de exito.
- Emails HTML y texto plano.
- Nombre de marca y tono.
- Guia [Brand and storefront](BRAND_STOREFRONT.md).

### 4. Rotacion de secretos

Objetivo: cambiar secretos fuertes antes de produccion.

Incluye:

- `ADMIN_SECRET`
- `CRON_SECRET`
- `PRINTFUL_API_TOKEN`
- `PRINTFUL_WEBHOOK_SECRET`
- Credenciales Firebase si se compartieron.
- Claves Stripe/Resend si se expusieron.

### 5. Dominio final en Vercel

Estado: `https://www.funnyteesforall.com` sirve la tienda publica. El deployment
de #27 fue comprobado contra ese dominio. No es una tarea de alta inicial:
quedan por verificar la decision canonica/redireccion y el valor efectivo de
`NEXT_PUBLIC_BASE_URL` segun la checklist.

Objetivo: mantener dominio real, `NEXT_PUBLIC_BASE_URL` y webhooks alineados.

Depende de:

- Dominio elegido.
- DNS configurado.
- Webhooks actualizados.

### 6. Paginas legales

Objetivo: crear paginas publicas necesarias antes de vender.

Minimo:

- Privacidad.
- Devoluciones.
- Contacto.
- Condiciones.

Estas paginas deben revisarse legalmente si el proyecto va a vender de verdad.

### 7. Stripe live

Objetivo: pasar de modo test a modo live solo cuando la tienda este preparada.

No hacerlo antes de cerrar:

- Textos.
- Legales.
- Secretos.
- Dominio.
- Webhooks.
- Fiscalidad.

### 8. Fiscalidad y Stripe Tax

Objetivo: validar obligaciones fiscales antes de activar `STRIPE_TAX_ENABLED=true`.

Decision vigente: mantener Stripe Tax desactivado y los seis destinos acordados.
El trabajo fiscal se ha aplazado por decision de la persona propietaria; no se
considera resuelto ni queda autorizado activarlo al documentar el proyecto.
La validacion profesional y los datos fiscales del negocio siguen pendientes.

### 9. Compra real controlada

Estado: aplazada por decision de la persona propietaria. Este recorrido se
conserva como requisito no verificado; requiere nueva autorizacion al retomarlo.

Objetivo: hacer una compra real de bajo riesgo con `ORDER_CONFIRM_PRINTFUL=true`.

Checklist:

- Producto barato o pedido interno controlado.
- Stripe live configurado.
- Printful billing listo.
- Tracking y emails observados.
- Plan de rollback preparado.

## Deuda tecnica importante

- Rate limit en memoria: mover a almacenamiento compartido si hay trafico real.
- Dependencias: Firebase Admin `14.5.0` y Next.js `15.5.26` ya estan
  integrados. La aceptacion del audit del 8 de octubre y su fecha de revision
  estan en [SECURITY.md](SECURITY.md). No duplicar aqui un recuento que pueda
  quedar desfasado; hallazgos nuevos requieren decision nueva. Remediar por
  tareas dedicadas y comprobar compatibilidad antes de un upgrade mayor.
  La auditoria completa del 11 de octubre detecto ademas avisos criticos en
  Vitest/Tinypool (desarrollo): evaluar/remediar por separado, sin considerarlos
  cubiertos por la aceptacion productiva anterior.
- Admin: valorar autenticacion mas robusta si el panel crece.
- Tests: mantener regresiones y ampliar la evidencia faltante de pending real,
  recuperacion de email y envio; no confundir la compra test previa con una
  compra end-to-end posterior a #27.
- Observabilidad: vigilancia manual ya definida en [operations.md](operations.md);
  quedan alertas automaticas y su verificacion, no una guardia automatica de Codex.
- Envios: investigar la configuracion v2 no verificable de la muestra crop
  `49803` y renovar evidencia de cobertura. No sustituir tecnica ni eliminar
  el bloqueo preventivo. No existe revalidacion automatica de ruta postpago.
