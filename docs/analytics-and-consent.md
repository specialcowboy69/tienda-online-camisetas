# Analítica opcional y consentimiento

## Estado y alcance

Implementación local del 13 de octubre de 2026, **apagada por defecto**.
No equivale a integración en main, despliegue, activación ni recepción en GA4.
Consultar la [evidencia](verification/2026-10-13-ga4-consent.md) y la
[checklist](LAUNCH_CHECKLIST.md) antes de activar. NO-GO no cambia.

El identificador público es `G-4JDZCBK8SY`. No es un secreto. El código no
añade Google Ads, conversiones, User-ID, Signals, medición de formularios ni
conversiones mejoradas. No modifica checkout, pedidos, catálogo ni impuestos.

## Configuración

- `NEXT_PUBLIC_ANALYTICS_ENABLED=false`: valor de entrega. Solo `true` habilita.
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

Se guarda `ncc.analytics-consent.v1` en localStorage: versión 1, `choice`
(`granted`/`denied`) y `decidedAt`, sin identificador de persona. Ambas elecciones
caducan a los 180 días; visitar no renueva el plazo. Datos inválidos, futuros,
caducados o lectura inaccesible deniegan por defecto. Si falla guardar, la
elección dura en memoria hasta abandonar la página; ajustes muestra el aviso.
Se revalida al recuperar foco, en cambios de otra pestaña, al medir y con timer
en tramos de máximo 24 horas. Retirar cancela inmediatamente la medición.

Consent Mode básico: antes de aceptar no se solicita gtag.js ni se envían pings.
`analytics_storage` puede concederse; los tres permisos publicitarios siguen
denegados. Se usa un único adaptador y cola propia `nccAnalyticsLayer`, sin
reemplazar etiquetas de terceros. No se acumulan visitas anteriores al permiso.

Solo se registra `page_view` propio en `/`, `/products` y PDP existentes,
registrados tras validar el catálogo. Títulos fijos Home/Products/Product,
URL canónica sin query/hash/UTM y referente externo reducido al origen. Rutas
internas sensibles, datos de formulario, pedidos y pagos no se envían. No hay
medición de `/admin`, `/success`, `/cancel`, APIs ni páginas desconocidas.
Navegación A/B/A cuenta tres visitas; renders/query/hash no añaden otra.

Cookies configuradas: prefijo `ncc`, 180 días, host-only, `/`, Secure,
SameSite=Lax, sin renovación por visita. La retirada elimina exclusivamente
`ncc_ga` y `ncc_ga_*`, no cookies comerciales. Es configuración solicitada:
el inventario de cookies del SDK real aún debe verificarse. El navegador de
pruebas usa cookies simuladas, no acredita comportamiento de Google.

El adaptador pausa antes de cambiar de pathname, usa `ga-disable-<ID>` y
descarta su cola. Quitar un script no descarga JavaScript ya ejecutado. Una
petición iniciada previamente no puede recuperarse. GA4 puede generar eventos
técnicos propios: no afirmar que todo el tráfico será únicamente page_view.

## Puertas obligatorias antes de activar

1. Publicar información legal revisada y añadir enlaces reales en ajustes;
   no usar borradores incompletos ni inventar datos del responsable.
2. Comprobar flujo, destinos de etiqueta, privacidad y retención de la propiedad.
   Apagar Enhanced Measurement **incluidos cambios de historial**, formularios,
   scroll, búsqueda, descargas, vídeo y clics. `send_page_view:false` no basta.
3. Con autorización separada, probar gtag.js real con colectores interceptados:
   retirada, rutas excluidas, parámetros sensibles y cookies reales. Cualquier
   ping no permitido mantiene la activación bloqueada.
4. Con permiso específico, enviar una visita controlada y comprobar recepción
   en Realtime/DebugView. Script cargado o respuesta 204 no acreditan recepción.
5. Autorizar flag true y nuevo deployment; verificar la versión publicada en
   móvil/escritorio, aceptación, rechazo y ajustes.

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
