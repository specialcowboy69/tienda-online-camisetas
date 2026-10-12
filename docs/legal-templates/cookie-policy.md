# Cookie policy: borrador

**PENDIENTE DE COMPLETAR, REVISAR Y PUBLICAR - BLOQUEA EL LANZAMIENTO**

## Notas internas: no publicar

Revisión del código, 13 de octubre de 2026: no se han encontrado integraciones
GA4/Google Ads/GTM ni escrituras explícitas de cookies, localStorage o
sessionStorage en `src`. El carrito usa estado de React. `layout.tsx` no carga
scripts de medición. Esto **no acredita que todo el dominio, hosting, recursos
externos o Checkout de Stripe carezcan de cookies**. Falta inventario real en
navegador; no declarar "cookie-free" ni inventar cookies o duraciones.

Este archivo no instala etiquetas ni crea un banner/CMP. La intención futura
del propietario es usar GA4 y Google Ads donde corresponda; ambos permanecen
fuera de esta entrega.

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

If we introduce analytics or advertising, we will update this information and
provide the required choices before activating those technologies. We will not
treat browsing or buying as consent to optional measurement or advertising.
There is currently no store analytics preference centre to link to.

### Contact

For questions, email orders@funnyteesforall.com. Controller details and how your
personal information is handled: [TO COMPLETE: final reviewed privacy policy URL].

Last updated: [TO COMPLETE: reviewed publication date].

## Diseño futuro acordado: no está implementado

- Inventariar primero qué etiquetas/cookies se pretenden usar, para qué, quién
  recibe datos y qué plazos se configuran. No reutilizar nombres/duraciones
  estándar como si fueran observaciones de esta web.
- Dar opciones claras de aceptar, rechazar o configurar; rechazar debe ser tan
  accesible como aceptar, sin casillas opcionales premarcadas. Separar analítica
  de publicidad y permitir retirar el consentimiento fácilmente.
- Criterio conservador: bloquear GA4 y Google Ads antes del consentimiento
  correspondiente para todos los visitantes. Consent Mode básico, sin carga de
  etiquetas ni pings de medición previos. No usar el modo avanzado como si
  equivaliera a no enviar datos cuando el consentimiento está denegado.
- Si se implementa: respetar `analytics_storage`, `ad_storage`, `ad_user_data`
  y `ad_personalization` según elección; no enviar email, nombre o dirección
  como parámetros de medición. Revisar aparte cualquier conversión mejorada.
- Probar primera visita, rechazo, aceptación por categorías, retirada y cambio
  de preferencias en móvil/escritorio mediante red y almacenamiento reales.
  Actualizar esta política, privacidad y la información por capas antes de activar.
- Mantener estas acciones pendientes. No instalar CMP ni activar analítica por
  aprobar únicamente este borrador.

Fuentes de revisión: [AEPD: guía de cookies](https://www.aepd.es/guias/guia-cookies.pdf)
y [Google: Consent Mode, básico frente a avanzado](https://developers.google.com/tag-platform/security/concepts/consent-mode).
