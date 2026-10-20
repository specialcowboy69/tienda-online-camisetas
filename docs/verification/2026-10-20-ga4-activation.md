# Activación de GA4 con consentimiento — 20 de octubre de 2026

## Ajustes de la propiedad aportados por el titular

- El flujo web de `https://www.funnyteesforall.com` muestra el ID
  `G-4JDZCBK8SY` y **Medición mejorada desactivada**. La captura visible
  indica únicamente «Vistas de página» en «Midiendo».
- La captura de conservación de datos muestra **2 meses** para datos de
  eventos, **14 meses** para datos de usuario y «Borrar cuando haya actividad
  nueva del usuario» activado. No se cambió esta configuración en la prueba.
- Otras capturas muestran Google Signals sin activar y ningún destino de
  etiqueta de sitio conectado. Esto no sustituye una revisión periódica de la
  propiedad ni acredita la recepción de eventos en sus informes.

## Prueba local con SDK real

Se construyó la aplicación con `NEXT_PUBLIC_ANALYTICS_ENABLED=true`,
`NEXT_PUBLIC_GA4_ID=G-4JDZCBK8SY` y `VERCEL_ENV=production`. El primer build
falló por `EPERM` al escribir `.next` dentro del sandbox; el mismo comando
fuera del sandbox terminó correctamente, sin modificar código. Se sirvió en
loopback y se ejecutó `scripts/verify-ga4-real-sdk.mjs` con el SDK auténtico,
**interceptando todas las solicitudes a colectores**: no se enviaron hits de
esta prueba local a GA4.

Resultado `PASS`: una carga del script, un `page_view` interceptado, consentimiento
denegado antes de cargar, cero eventos en ruta excluida y cero cookies propias
de Analytics tras retirar el permiso. No reapareció el `scroll` que había
bloqueado la prueba del 19 de octubre. La prueba no cubre todos los navegadores,
extensiones o cambios futuros de la propiedad.

## Activación y comprobación pública

Antes de activar, la CLI de Vercel no listaba `NEXT_PUBLIC_GA4_ID` ni
`NEXT_PUBLIC_ANALYTICS_ENABLED` para Production. Se añadieron **solo en
Production** los valores públicos `G-4JDZCBK8SY` y `true`, respectivamente,
y se reconstruyó el deployment productivo existente; las variables `NEXT_PUBLIC`
se incorporan al build. Preview, Google Ads, Stripe Tax, pagos live y
fabricación no se cambiaron.

La CLI verificó `dpl_AQzctqzSu7F8riAsu3VadujKHcFM` en estado `Ready`, con
alias `https://www.funnyteesforall.com`. En un navegador sin consentimiento
previo se vio el banner. Al **rechazar**, no apareció el script `#ncc-ga4-script`.
Después, desde «Cookie settings», al **aceptar**, apareció la etiqueta
`https://www.googletagmanager.com/gtag/js?id=G-4JDZCBK8SY&l=nccAnalyticsLayer`.
Tras recargar con el permiso guardado, la red mostró respuesta HTTP 200 del
script y HTTP 204 de `https://region1.google-analytics.com/g/collect`.
Después se retiró el permiso desde ajustes. La navegación a `/products` no
generó ninguna nueva solicitud `/g/collect` en la captura de red. El elemento
script ya ejecutado permaneció en el DOM; la retirada no puede deshacer una
petición anterior ni descargar código ya ejecutado.

Con una vista de 390 × 844 px, el catálogo y el diálogo «Cookie settings» se
mostraron sin desbordamiento visible; el checkbox seguía desmarcado y ambos
botones eran accesibles. Se restableció el viewport habitual al terminar.

La respuesta 204 prueba que el colector respondió a esta visita controlada;
**no prueba** que el evento aparezca en Realtime/DebugView, que los informes
estén configurados correctamente ni el cumplimiento jurídico definitivo. La
verificación de recepción en la interfaz GA4 sigue pendiente. Esta comprobación
móvil fue visual y no repitió toda la matriz de rutas o navegadores. El estado
global de lanzamiento permanece `NO-GO`.
