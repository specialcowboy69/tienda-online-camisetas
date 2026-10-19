# Páginas legales públicas y prueba aislada de GA4 — 19 de octubre de 2026

## Entrega pública

- [PR #38](https://github.com/specialcowboy69/tienda-online-camisetas/pull/38) está `MERGED` en `main`; merge `4637a839cfc0049cd1c9199c4bf6ad285d5ac029`.
- Vercel Production `dpl_GwBUEjaeDumw3oJpoPGgDxpr9TY4` aparece `Ready`, corresponde al merge y tiene el alias `https://www.funnyteesforall.com`.
- `https://www.funnyteesforall.com/privacy` y `/cookies` respondieron HTTP 200 y mostraron los textos y el correo de soporte. `/privacy` contiene la razón social y dirección facilitadas por el titular. Los enlaces están en footer, ajustes de cookies y aviso de checkout.
- Los textos publicados no constituyen una revisión jurídica externa. Otras plantillas y decisiones de lanzamiento siguen pendientes.

## Prueba con el SDK real sin enviar eventos a Google

Se construyó la aplicación local con `NEXT_PUBLIC_ANALYTICS_ENABLED=true`, `NEXT_PUBLIC_GA4_ID=G-4JDZCBK8SY` y `VERCEL_ENV=production`. Se sirvió en loopback; Playwright presentó al navegador el origen canónico mediante una redirección controlada a ese servidor. El SDK `gtag.js` se descargó realmente, pero **toda solicitud a colectores Google fue interceptada y respondida localmente**.

Comando repetible, después de `npm.cmd run build` y `npm.cmd run start -- --port 3100` con esas variables en las respectivas shells:

```powershell
node scripts/verify-ga4-real-sdk.mjs --base-url http://127.0.0.1:3100 --module-root 'C:\Users\USUARIO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules' --channel chrome
```

La primera pasada limitada confirmó: antes de decidir y después de rechazar no hubo carga de etiqueta ni hits; tras aceptar se observó una carga del SDK y un `page_view` interceptado dirigido a `G-4JDZCBK8SY`; un cambio hacia `/success?order_id=synthetic` no produjo nuevos hits, y la retirada eliminó las cookies propias.

Al ampliar la prueba con un cambio de query en la misma ruta se observó **un evento automático `scroll` adicional**. El evento interceptado no contenía la query sintética, pero excede el único `page_view` explícito de nuestra implementación. La prueba ampliada devuelve exit code 1 como puerta de activación. No atribuir el evento a un cambio de historial concreto: pudo generarse por el desplazamiento de la página durante el ensayo. [Google documenta](https://support.google.com/analytics/answer/9216061?hl=en) que Medición mejorada también puede generar eventos de historial, formularios y scroll. Hace falta comprobar y ajustar la propiedad en GA4 y repetir la prueba hasta verde. No se enviaron hits de esta prueba a GA4.

La prueba local **no** acredita que la propiedad GA4 tenga Medición mejorada desactivada, ni su conservación, recepción en Realtime, comportamiento en todas las páginas o cumplimiento jurídico definitivo. Al contrario, el `scroll` automático es un bloqueo observado. No se ha activado el flag en Vercel; la medición productiva sigue apagada. Antes de activarla, aplicar las puertas de [analítica y consentimiento](../analytics-and-consent.md).

## Verificación de código

En el PR #38: 776 tests, TypeScript y build pasaron; ESLint de los archivos modificados pasó. `npm.cmd run lint` global conserva cuatro errores de helpers locales ignorados en `.superpowers/` y no se presenta como verde. El preview y el deployment productivo quedaron `Ready`.

Esta actualización documental añade la prueba aislada del SDK a la rama posterior; no cambia variables de Vercel ni configura GA4 o Google Ads.
