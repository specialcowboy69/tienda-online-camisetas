# Cookie policy: borrador

**PENDIENTE DE COMPLETAR, REVISAR Y PUBLICAR - BLOQUEA EL LANZAMIENTO**

## Notas internas: no publicar

Revisión actualizada el 14 de octubre de 2026, posterior al PR #35: el código
incluye consentimiento previo para GA4, retirada y un diálogo accesible desde
Cookie settings en el footer. GA4 está desplegado **apagado**; Google Ads y GTM
no están integrados. El estado anterior sin integración queda sustituido por
esta revisión. Véanse el [procedimiento](../analytics-and-consent.md) y la
[evidencia fechada](../verification/2026-10-13-ga4-consent.md).

El código guarda las decisiones mediante `ncc.analytics-consent.v1` en
localStorage (versión, elección y fecha; caducidad de 180 días). No equivale a
una cookie de medición. Las cookies GA4 con prefijo `ncc` y duración solicitada
de 180 días son configuración del adaptador, **no un inventario observado del
SDK real**. Falta verificar ese inventario antes de activar. El carrito usa
estado de React. No declarar "cookie-free": hosting, recursos externos y
Checkout de Stripe requieren su propia comprobación.

Este archivo no activa etiquetas ni modifica consentimiento o configuración.
La publicación legal, las pruebas con el SDK real y la activación requieren
sus verificaciones y autorización separadas.

## Borrador para cliente: completar y revisar antes de publicar

### Cookies and similar technologies

Cookies are small pieces of information stored by your browser. Similar
technologies may store preferences or help services operate. Their purpose,
provider and duration depend on the service involved.

No Context Club does not currently have GA4 or Google Ads tracking enabled in
its store implementation. Our checkout is hosted by Stripe on a separate
payment page. Services used for hosting, payment or security may use their
own technologies; the verified inventory below explains what applies.

### Inventory

[TO COMPLETE: browser-verified inventory covering the storefront, external
resources and hosted checkout; record each cookie or technology, provider,
purpose, domain, duration and applicable consent requirement. Record verified
absence where appropriate, not guessed entries].

### Your choices

You can manage or remove cookies through your browser settings. Blocking
technologies required for a service may affect that service. Browser settings
do not replace any consent choice we must offer before optional tracking.

You can open Cookie settings from the store footer. Analytics is currently off;
the settings explain that status and do not offer an option to enable it.
Before enabling optional analytics, we will update this information and provide
the required choices. Advertising is not enabled. Browsing or buying does not
constitute consent to optional measurement or advertising.

### Contact

For questions, email orders@funnyteesforall.com. Controller details and how your
personal information is handled: [TO COMPLETE: final reviewed privacy policy URL].

Last updated: [TO COMPLETE: reviewed publication date].

## Estado implementado y verificaciones pendientes

- Inventariar primero qué etiquetas/cookies se pretenden usar, para qué, quién
  recibe datos y qué plazos se configuran. No reutilizar nombres/duraciones
  estándar como si fueran observaciones de esta web.
- Implementado para GA4 en #35, sin activar: opciones de aceptar, rechazar o
  configurar cuando la medición esté habilitada; rechazar debe ser tan
  accesible como aceptar, sin casillas opcionales premarcadas. Separar analítica
  de publicidad y permitir retirar el consentimiento fácilmente.
- GA4 usa Consent Mode básico y está bloqueado antes del consentimiento
  correspondiente para todos los visitantes, sin carga de
  etiquetas ni pings de medición previos. No usar el modo avanzado como si
  equivaliera a no enviar datos cuando el consentimiento está denegado.
- El código concede únicamente `analytics_storage` tras aceptación; mantiene
  `ad_storage`, `ad_user_data` y `ad_personalization` denegados. Ads y conversiones
  mejoradas no están implementados; no se envían datos de formulario a Analytics.
- Probar primera visita, rechazo, aceptación por categorías, retirada y cambio
  de preferencias en móvil/escritorio mediante red y almacenamiento reales.
  Actualizar esta política, privacidad y la información por capas antes de activar.
- Pruebas locales de consentimiento y revisión pública con Analytics apagado
  ya documentadas; no confundirlas con verificación del SDK o recepción en GA4.
  Mantener pendientes las puertas de activación. Aprobar este borrador no las cierra.

Fuentes de revisión: [AEPD: guía de cookies](https://www.aepd.es/guias/guia-cookies.pdf)
y [Google: Consent Mode, básico frente a avanzado](https://developers.google.com/tag-platform/security/concepts/consent-mode).
