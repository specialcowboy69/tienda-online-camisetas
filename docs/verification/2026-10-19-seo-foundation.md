# SEO foundation A+B — verificación local, 19 de octubre de 2026

Alcance: implementación en el worktree `codex/camisetas-seo-foundation`.
**NO-GO sigue vigente.** No se ha hecho push de esta rama, PR, merge a main,
despliegue, envío a GSC ni prueba Google Rich Results. No se han activado pagos,
fabricación, Stripe Tax, alertas ni analítica nueva.

## Código y revisión

La base SEO A (publicación, metadata, canonical, noindex, sitemap/robots,
Organization y BreadcrumbList) se implementó en los commits `a40ac21` a
`6cbd361`. Tras el merge del trabajo legal/panel del PR #38 (`4637a839`) en
`origin/main`, se incorporó ese main a esta rama mediante `68d0ab2`. La fase B
añadió la URL de variante y selección inicial en `19b069d` y `9d7e7fb`, y
ProductGroup/Offers seguros en `9f3f0e2` y `47f21fa`. Este documento y el
smoke B pertenecen al commit de Task 7 (`git log -1 --format=%H --
scripts/verify-seo.mjs`). Las revisiones independientes finales de B
corresponden al coordinador y se registrarán por separado.

El schema usa solo productos publicables y variantes que el panel puede
seleccionar. Omite ofertas con precio, moneda, imagen o ID no fiables; no
inventa stock, reseñas, GTIN, descuentos ni condiciones de envío/devolución.
El canonical de una URL `?variant=<id>` sigue apuntando a la ficha limpia.

## Pruebas y evidencia

- RED del gate B: `node --test scripts/verify-seo.test.mjs` falló por la
  ausencia de `allowedVariantAuditUrl`; la fase A ya tenía 12 pruebas verdes.
- GREEN B: 16/16 pruebas Node. Incluyen URL de variante del mismo producto
  y origen, máximo dos Offers muestreados por PDP, canonical limpio, precio
  e imagen principal inicial exactos, rechazo de URL insegura, y ausencia
  de catálogo con sitemap 503. El fixture usa HTML y fetch sintéticos.
- `npm.cmd test`: 58 archivos, 856/856 pruebas. `npm.cmd run lint`,
  `npx.cmd tsc --noEmit --incremental false` y `npm.cmd run build`: exit 0
  en este worktree. Build Next 15.5.26 compiló y generó 9/9 páginas estáticas.
- Un ejemplo sintético de ProductGroup se comprobó en Schema.org Validator:
  0 errores y 0 warnings. Eso no es una prueba de datos de catálogo real,
  Google Rich Results ni una URL desplegada.

## Smoke HTTP local

Se arrancó el build recién compilado con `next start --hostname 127.0.0.1
--port 3218`; el proceso se detuvo tras la prueba. Comando:

```powershell
node scripts/verify-seo.mjs --base-url http://127.0.0.1:3218 --output .superpowers/sdd/2026-10-19-camisetas-seo-foundation/seo-http-local-b.json
```

Resultado: **exit 1**. Doce GET sin cookies, body ni redirecciones:

| Rutas | HTTP | Resultado |
| --- | --- | --- |
| `/`, `/products`, `/privacy`, `/cookies` | 200 | Titles, canonical y H1 comercial conforme al gate |
| `/admin`, `/success`, `/cancel` | 200 | noindex presente |
| `/products/seo-smoke-nonexistent` | 404 | noindex presente |
| Home y catálogo con `utm_source=seo-smoke` | 200 | canonical limpio |
| `/robots.txt` | 200 | directiva Sitemap esperada |
| `/sitemap.xml` | 503 | comparación de URL públicas bloqueada |

Sin credenciales de catálogo local seguras, `/products` no devolvió enlaces de
productos. Por tanto **no hubo HTTP de PDP ni de variante**: los checks de
precio/imagen B están implementados y probados con mock, pero no validados
contra Firestore real o producción. No se copiaron credenciales para
desbloquearlo. El reporte JSON local está ignorado por Git en `.superpowers/`.

El CLI acepta solo GET a loopback o al origen HTTPS exacto
`https://www.funnyteesforall.com`, sin credenciales ni fragmento. Su allowlist
excluye API, carrito y checkout; rechaza toda redirección. Antes de visitar
una URL de Offer exige el mismo origen y path de ficha y una única query
`?variant=<id>` con ID decimal canónico positivo y seguro. Compara canonical,
precio visible inicial del buybox e imagen principal inicial con el Offer y
Product hijo, no solo con el rango de precios. Muestrea hasta 20 fichas del
catálogo y dos variantes por ficha; el resto figura como limitación. La salida
debe ser un JSON nuevo en una carpeta existente de este checkout.

Este gate analiza HTML inicial; no sustituye una prueba de interacción real.
Una ejecución futura sobre producción exige autorización y repetir la
comparación de robots servido por CDN, sitemap poblado y PDP/variantes
publicadas. No acredita indexación, compra real ni resultados SEO.

## Pendiente

- Revisión independiente final de Task 7 B y auditoría de integración antes
  de declarar la rama lista o crear un PR. La integración local del PR #38
  no integra esta rama SEO en main.
- HTTP con catálogo seguro poblado, comparación sitemap↔catálogo, al menos
  una ficha y dos variantes reales; pruebas Rich Results y despliegue.
- Checklist legal, fiscal, seguridad, proveedores y aceptación GO siguen
  pendientes según `docs/LAUNCH_CHECKLIST.md`.
