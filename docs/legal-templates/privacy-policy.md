# Privacy policy: borrador

**PENDIENTE DE COMPLETAR, REVISAR Y PUBLICAR - BLOQUEA EL LANZAMIENTO**

## Notas internas: no publicar

Preparado el 13 de octubre de 2026 a partir del código, no de una plantilla que
afirme servicios inexistentes. No crea una página pública. La marca y el correo
existente no sustituyen la identidad del responsable. Los marcadores quedan en
pausa por decisión del propietario, no resueltos por suposición.

### Inventario técnico observado

| Flujo | Datos / implementación | Proveedores actuales a revisar contractualmente |
| --- | --- | --- |
| Cotización y pedido | Nombre, email, teléfono cuando se facilita, dirección, artículos, variantes, importes; `types.ts`, `order-service.ts`, `printful.ts` | Printful recibe datos de destinatario para cotizar y gestionar pedidos, incluso antes del pago |
| Pago alojado | Stripe Checkout; identificadores, estados, importes y reembolsos; `stripe.ts`, `refund-service.ts` | Stripe; el formulario propio no recoge el número completo de tarjeta |
| Persistencia | Pedidos, snapshots de reembolso, payloads de webhooks, tracking, trabajos de email y diagnósticos; `firestore.ts`, `types.ts` | Google Firebase / Firestore |
| Emails transaccionales | Destinatario, contenido renderizado, referencia de pedido, recibo de proveedor e intentos; `email.ts`, `email-jobs.ts` | Resend; recepción del buzón de soporte y su proveedor pendientes de auditar |
| Web e imágenes | Peticiones, metadatos técnicos y recursos de imágenes externos | Vercel y Cloudflare R2; verificar logs, localizaciones y conservación configurados |
| Protección | Límites de abuso, validación de pago/dirección y elegibilidad de envío | Código propio y datos de servicios; no equivale a un perfil publicitario |
| Preferencias de analítica (revisión del 14 de octubre) | `ncc.analytics-consent.v1`: versión, elección y fecha en localStorage, caducidad de 180 días; `analytics-consent.ts` | Preferencia del navegador; GA4 implementado pero desplegado apagado, Ads no implementado |

No se ha verificado una política de borrado/TTL ni conservación uniforme de
payloads o emails. La caducidad de un lease no elimina un pedido. Revisar acceso,
minimización, plazos por categoría y eliminación real antes de prometerlos.
Tampoco se han acreditado en esta tarea regiones de almacenamiento, entidades
contratantes, acuerdos de tratamiento o garantías de transferencias concretas.
La revisión posterior al PR #35 confirma GA4 implementado con consentimiento
previo y retirada, desplegado apagado. Google Ads no está integrado. Antes de
activar medición siguen pendientes inventario del SDK real, configuración de
propiedad, información legal y autorización separada; ver
[analítica y consentimiento](../analytics-and-consent.md). No se activan aquí.

## Borrador para cliente: completar y revisar antes de publicar

### Who is responsible

No Context Club at https://www.funnyteesforall.com is operated by
[TO COMPLETE: verified legal controller name and geographical address].
For privacy requests, contact orders@funnyteesforall.com.

### Information we use

We use the contact and delivery details you provide, your chosen products,
shipping options and order amounts. We also receive payment status, transaction
references, refund information and delivery updates from our service providers.
When you contact us, we use your message and any evidence you choose to send.
Please do not email full card details or unnecessary identity documents.

Our payment page is hosted by Stripe. Card details are entered with the payment
provider rather than in our own order form. We retain order and payment-status
records, transactional email content and delivery records to operate the store.
Website requests and security checks also involve technical information such as
IP addresses, request details and diagnostic records.

Cookie settings in the store footer explains the current analytics status.
When analytics is available, it lets you change or withdraw your choice. The
preference record contains the choice, its version and decision date in your
browser; a choice is valid for 180 days. This record does not itself enable
tracking; analytics is currently off. See [TO COMPLETE: final reviewed cookie policy URL].

### Why we use it

- To calculate shipping you request, process payment, produce and deliver your
  order, and provide order support: steps at your request and performance of
  our contract. Required contact, address and order details are needed for these
  services; without them we cannot obtain a usable quote or complete delivery.
- To meet applicable recordkeeping and consumer-law duties: legal obligations.
  [TO COMPLETE: applicable obligations and corresponding records].
- To prevent abuse, investigate errors and establish or defend claims: our
  legitimate interests in a secure store and resolving disputes, subject to
  your rights and the applicable balancing assessment.

Order emails are service messages, not a subscription to marketing. GA4 and
Google Ads are not currently enabled by this store's implementation. Any future
optional measurement or advertising will be explained before activation and
subject to the required consent controls.

### Sharing and international processing

We use hosting, database, payment, production, delivery and email providers.
Shipping enquiries require sending recipient and item information to the
service that calculates the quote, even if you do not finish the purchase.
Order processing, payment checks and delivery updates also exchange information
with these providers. We may disclose information where legally required or
necessary to handle a claim.

[TO COMPLETE: verified provider roles, processing countries, applicable transfer
mechanisms and how to obtain the relevant safeguards]. We do not promise that
all processing stays within the European Economic Area.

### Retention and your rights

[TO COMPLETE: verified retention periods or precise criteria for orders, quotes,
emails, support, payment/webhook records, security logs and backups, including
legal holds and actual deletion procedures].

Where applicable, you may request access, correction, erasure, restriction or
portability, and object to processing based on legitimate interests. You may
withdraw consent for consent-based processing without affecting its prior
lawfulness. Contact orders@funnyteesforall.com; we may need proportionate
verification of your identity. You may complain to a competent data protection
authority, including the Spanish AEPD at https://www.aepd.es.

Checkout uses automated payment, address and shipping-eligibility checks. If a
check prevents an order and you need help, contact us.
[TO COMPLETE: review whether any processing falls under GDPR Article 22 and
provide the applicable explanation and safeguards].

Last updated: [TO COMPLETE: reviewed publication date].

## Revisión pendiente y fuentes

- Identidad y datos obligatorios: reutilizar `business-and-return-details.md`,
  sin inferirlos de la marca. Revisar si corresponde representante o DPO.
- Verificar bases jurídicas, interés legítimo, ejercicio de derechos, acceso
  restringido, contratos, transferencias y conservación antes de publicación.
- Presentar información breve también junto al formulario que recoge los datos;
  un Markdown interno no informa al comprador ni implementa sus derechos.
- [AEPD: derecho de información](https://www.aepd.es/derechos-y-deberes/conoce-tus-derechos/derecho-de-informacion).
- [RGPD, artículos 5, 6, 13, 15-22 y 44-49](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng).
- Revisión del proveedor de buzón, plazos, terceros y navegador pendiente;
  no se ha cargado ninguna credencial ni accedido a datos de clientes aquí.
