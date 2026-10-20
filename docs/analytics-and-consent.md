# Analítica opcional y consentimiento

## Estado y alcance

Integrado y desplegado inicialmente **apagado** el 13 de octubre de 2026 mediante
PR #35, merge `2bd0f7a`; Vercel Production
`dpl_GgYD23Vk8F5vd2mDA6RhvcjBAG5J` READY. La verificación de entonces en
móvil/escritorio no observó carga de Analytics.
El 19 de octubre se publicaron `/privacy` y `/cookies` en #38 y se ejecutó una
[prueba aislada con gtag.js real](verification/2026-10-19-legal-pages-and-ga4-sdk.md)
con colectores interceptados. Aquella prueba detectó un `scroll` automático
adicional y bloqueó la activación hasta ajustar la propiedad.

**Estado desde el 20 de octubre:** GA4 está habilitado solo en Vercel Production
para visitas con consentimiento, tras desactivar Medición mejorada y repetir la
prueba del SDK. Deployment `dpl_AQzctqzSu7F8riAsu3VadujKHcFM` READY,
asociado a `www.funnyteesforall.com`. En la web pública, rechazar no cargó la
etiqueta; aceptar cargó `gtag.js` (HTTP 200) y Google respondió HTTP 204 a
`/g/collect`. La recepción en el informe Realtime/DebugView de GA4 sigue
**sin verificar**: una respuesta del colector no la acredita. Véase la
[verificación fechada](verification/2026-10-20-ga4-activation.md), la
[evidencia inicial](verification/2026-10-13-ga4-consent.md) y la
[checklist](LAUNCH_CHECKLIST.md). El estado comercial `NO-GO` no cambia.

El 20 de octubre se integraron #41 y #43. #43 deja que el SDK de GA4 genere
la primera vista y prepara las vistas de navegación interna mediante historial.
GitHub registra deployment Production correcto para el merge `ac61bef`; la
comprobación directa del dominio público respondió HTTP 200. Esto no verifica
todavía recepción en Realtime ni activa por sí mismo Medición mejorada.

**Verificación del 21 de octubre:** #44 (merge `38ae7a7`) desplegó el aviso y
las políticas ampliadas junto con el consentimiento v2. GitHub registró el
deployment Production `7213001459` como `success`; las páginas públicas
`/privacy` y `/cookies` respondieron HTTP 200 y la home mostró el nuevo aviso.
Tras aceptarlo en una sesión de prueba, se solicitó `gtag.js` y se observó una
petición POST a `/g/collect`. El informe Realtime de la propiedad devolvió
`first_visit=1`, `page_view=1` y `session_start=1`. Esto acredita recepción de
la medición básica, no de eventos automáticos adicionales. Al retirar después
el permiso v2 y navegar a `/products`, no se observó ninguna nueva petición a
Google Analytics en esa sesión. Medición mejorada
se activó brevemente para inspeccionar sus opciones: búsqueda interna e
interacciones con formularios aparecieron marcadas por defecto. No se guardó
ningún cambio en esas opciones y el interruptor principal se volvió a apagar.
No se probó un evento de formulario ni se afirma que ninguno haya podido
producirse durante ese intervalo. La activación selectiva queda pendiente de
decisión expresa; el estado comercial sigue `NO-GO`.

El identificador público es `G-4JDZCBK8SY`. No es un secreto. El código no
añade Google Ads, conversiones, User-ID, Signals ni conversiones mejoradas.
Medición mejorada de GA4 puede incorporar eventos automáticos de interacción
solo después de consentimiento y activación en la propiedad. Antes de activarla,
deshabilitar las opciones de interacciones con formularios y búsqueda interna:
las páginas de producto contienen un formulario con datos de entrega y la
redacción automática de parámetros de Google no sustituye a una prueba de
privacidad. Esta barrera se mantiene aunque el nuevo aviso de consentimiento
esté desplegado. La aplicación no envía contenidos de formularios a GA4.
No modifica checkout, pedidos, catálogo ni impuestos.

## Configuración

- `NEXT_PUBLIC_ANALYTICS_ENABLED=true` en Production desde el 20 de octubre;
  antes estuvo `false`. Solo `true` habilita.
- `NEXT_PUBLIC_GA4_ID=G-4JDZCBK8SY`.
- Además se exige `VERCEL_ENV=production` y origen exacto
  `https://www.funnyteesforall.com` en el navegador.
- Preview y localhost permanecen bloqueados. Las variables NEXT_PUBLIC se
  incorporan al build: cambiar la configuración requiere un nuevo deployment.

## Preferencias y datos

El banner ofrece aceptar y rechazar con el mismo tratamiento visual. Ajustes
puede abrirse siempre desde **Cookie settings**. Escape o Cancel no aceptan.
El diálogo conserva/restaura el foco; cambiar la elección no recarga ni desmonta
el formulario de compra. El banner reserva espacio para no tapar el footer.

Se guarda `ncc.analytics-consent.v2` en localStorage: versión 2, `choice`
(`granted`/`denied`) y `decidedAt`, sin identificador de persona. Ambas elecciones
caducan a los 180 días; visitar no renueva el plazo. Datos inválidos, futuros,
caducados o lectura inaccesible deniegan por defecto. Si falla guardar, la
elección dura en memoria hasta abandonar la página; ajustes muestra el aviso.
La elección anterior `v1` se elimina y no se reutiliza: medir interacciones
requiere que la persona acepte el aviso ampliado.
Se revalida al recuperar foco, en cambios de otra pestaña, al medir y con timer
en tramos de máximo 24 horas. Los eventos de otra pestaña provocan releer el
registro vigente; no restauran la aceptación de un evento atrasado. Retirar
cancela inmediatamente la medición.

Consent Mode básico: antes de aceptar no se solicita gtag.js ni se envían pings.
`analytics_storage` puede concederse; los tres permisos publicitarios siguen
denegados. Se usa un único adaptador y cola propia `nccAnalyticsLayer`, sin
reemplazar etiquetas de terceros. No se acumulan visitas anteriores al permiso.

No se envía un evento `page_view` manual. Tras el consentimiento, la
configuración de GA4 registra automáticamente la primera visita en `/`,
`/products` y PDP existentes, registrados tras validar el catálogo. Los
títulos son fijos (Home/Products/Product); se proporciona URL canónica sin
query/hash/UTM y referente externo reducido al origen. `/admin`, `/success`,
`/cancel`, APIs y páginas desconocidas quedan excluidas. Las visitas en
navegación interna dependen de que GA4 tenga activada la medición de cambios
de historial; con Medición mejorada apagada, no se contabilizan automáticamente.
El aviso y las políticas describen ahora las interacciones que GA4 puede medir
cuando se active. La captura aportada por el propietario muestra conservación
de eventos de 2 meses y datos de usuario de 14 meses en la propiedad.

Cookies configuradas: prefijo `ncc`, 180 días, host-only, `/`, Secure,
SameSite=Lax, sin renovación por visita. La retirada elimina exclusivamente
`ncc_ga` y `ncc_ga_*`, no cookies comerciales. Es configuración solicitada:
el inventario de cookies del SDK real aún debe verificarse. El navegador de
pruebas usa cookies simuladas, no acredita comportamiento de Google.

El adaptador mantiene GA4 activo entre páginas públicas y lo pausa antes de
entrar en una ruta excluida; usa `ga-disable-<ID>` y descarta su cola. Quitar
un script no descarga JavaScript ya ejecutado. Una
petición iniciada previamente no puede recuperarse. GA4 puede generar eventos
técnicos propios: no afirmar que todo el tráfico será únicamente page_view.

## Puertas de activación y verificación restante

1. Publicar información legal revisada y añadir enlaces reales en ajustes;
   no usar borradores incompletos ni inventar datos del responsable.
2. Comprobar flujo, destinos de etiqueta, privacidad y retención de la propiedad.
   Antes de encender Medición mejorada, actualizar el aviso y las políticas
   públicos para cubrir sus eventos y verificar con el SDK real que los cambios
   de historial no duplican vistas ni revelan parámetros sensibles. El
   `page_view` inicial ya lo genera GA4; no añadir otro manual.
3. Con autorización separada, probar gtag.js real con colectores interceptados:
   retirada, rutas excluidas, parámetros sensibles, cookies reales y restauración
   desde suspensión/BFCache. Cualquier
   ping no permitido mantiene la activación bloqueada.
4. La visita controlada posterior a #44 apareció en Realtime como `page_view`.
   Quedan sin verificar los eventos adicionales de Medición mejorada, que está
   apagada; recepción básica no equivale a recepción de cada interacción.
5. Flag true y deployment productivo verificados en escritorio. En móvil
   390 × 844 px se inspeccionaron visualmente catálogo y ajustes; la retirada
   pública no emitió otro hit al navegar. No es una matriz exhaustiva.

## Desactivación

Poner `NEXT_PUBLIC_ANALYTICS_ENABLED=false`, redesplegar y verificar cero carga
en una sesión nueva. No elimina datos ya enviados ni detiene pestañas que
siguen ejecutando el deployment anterior. No hacer rollback comercial por esta
tarea. Las preferencias del navegador no se convierten en consentimiento para Ads.

## Repetir verificación local sin enviar datos

`scripts/verify-analytics-consent.mjs` acepta `--base-url` loopback,
`--module-root` al node_modules del runtime externo de Playwright,
`--output output/playwright/ga4-consent`, `--mode off` y opcional `--channel chrome`.
Usar un build/start con flag false primero, luego otro con flag true e ID y
VERCEL_ENV solo en el proceso. Restaurar build false al terminar.
El origen canónico se intercepta hacia loopback; **nunca hacia Production**.
Se bloquean APIs comerciales y todo host no permitido; las imágenes y gtag se
simulan. Solo se permite leer catálogo mediante las credenciales locales ya
existentes, sin copiar secretos. No se envían formularios ni se generan pedidos.

Referencias oficiales:
[Consent Mode](https://developers.google.com/tag-platform/security/concepts/consent-mode),
[page views](https://developers.google.com/analytics/devguides/collection/ga4/views),
[configuración](https://developers.google.com/analytics/devguides/collection/ga4/reference/config),
[privacidad](https://developers.google.com/tag-platform/security/concepts/privacy).
