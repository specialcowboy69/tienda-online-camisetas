# SEO foundation A+B — verificación local, 19 de octubre de 2026

Alcance: implementación en el worktree `codex/camisetas-seo-foundation`.
**NO-GO sigue vigente.** Este corte local del 19 de octubre era anterior al
push y al PR; el seguimiento del 20 de octubre figura al final. No hubo merge
a main, despliegue de producción ni envío a GSC. No se han activado pagos,
fabricación, Stripe Tax, alertas ni analítica nueva.

## Código y revisión

La base SEO A (publicación, metadata, canonical, noindex, sitemap/robots,
Organization y BreadcrumbList) se implementó en los commits `a40ac21` a
`6cbd361`. Tras el merge del trabajo legal/panel del PR #38 (`4637a839`) en
`origin/main`, se incorporó ese main a esta rama mediante `68d0ab2`. La fase B
añadió la URL de variante y selección inicial en `19b069d` y `9d7e7fb`, y
ProductGroup/Offers seguros en `9f3f0e2` y `47f21fa`. El smoke B se añadió en
`122486f`. La revisión global encontró que opciones de color o talla con
espacios podían crear una URL y una Offer ambiguas; `0d812843` las excluye.
**Código revisado: `0d812843de2942d650447d174f1ef183d1b19062`.** Las
revisiones independientes de A, B y el arreglo final terminaron sin hallazgos
abiertos. Después se incorporó el `origin/main` que contiene el PR #39
(`255b1c1`) en el merge local `19af136626ad15cf9434b39c2ab714c7e7948a31`,
sin conflictos.

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
- `npm.cmd test`: 58 archivos, 860/860 pruebas. `npm.cmd run lint`,
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
Tras incorporar `origin/main`, se repitió el smoke contra un build nuevo en
`127.0.0.1:3220`: 12 GET, los mismos estados y **exit 1** por sitemap 503,
sin fichas ni variantes HTTP. Reporte ignorado:
`.superpowers/sdd/2026-10-19-camisetas-seo-foundation/seo-http-final-merge.json`.

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

## Pendiente al cierre del primer seguimiento

- El PR SEO #40 está abierto en borrador; integración y despliegue de
  producción aún pendientes. La integración local del PR #38 no integra esta
  rama SEO en main.
- CLI HTTP completo sobre catálogo seguro, con canonical y URL exacta de
  imagen comparados con cada Offer; prueba Rich Results por URL y producción.
- Checklist legal, fiscal, seguridad, proveedores y aceptación GO siguen
  pendientes según `docs/LAUNCH_CHECKLIST.md`.

## Seguimiento del 20 de octubre — PR #40

El [PR #40](https://github.com/specialcowboy69/tienda-online-camisetas/pull/40)
está abierto como borrador contra `main`. La revisión independiente detectó
dos fallos de robustez: publicación de un producto sin metadatos SEO y una
excepción del schema si Firestore entrega un precio numérico. Se reprodujeron
con pruebas rojas, se corrigieron en `5661316` y un segundo revisor comprobó
ambas correcciones sin nuevos bloqueos de código. Tras el cambio pasaron
`npm.cmd test` (862/862), lint, TypeScript, build y el gate Node (16/16).

El endpoint público de catálogo devolvió cinco productos. Una comprobación
local de la rama, alimentada por esos datos públicos sin credenciales,
generó 130 Offers entre las cinco fichas y comparó cada precio, imagen, URL
de variante y selección con el dato de origen. Pasó 2/2; la segunda prueba
generó una muestra de HTML para validar en Google. El archivo temporal
está ignorado en `.superpowers/`. Es evidencia sobre datos reales, pero no
sustituye HTTP de la versión desplegada.

El [preview protegido del SHA `5661316`](https://tienda-online-camisetas-q8qlzu8sl-specialcowboy69s-projects.vercel.app)
quedó `READY` en Vercel. Un navegador autenticado leyó `/sitemap.xml` con
cuatro URLs estáticas y cinco fichas; `/products` mostró las mismas cinco
fichas. La ficha
`falling-apart-cat-graphic-tee` mostró `$39.99`; `?variant=5489215132`
seleccionó Black / S, `$39.99` y la quinta imagen; `?variant=5489218794`
seleccionó True Navy / S, `$39.50` y la sexta imagen. Los valores coinciden
con el catálogo público. La conexión Vercel del plugin devolvió 403 al
intentar leer el HTML protegido, y el navegador no entregó el HTML fuente;
por tanto no se ejecutó el CLI HTTP ni se compararon allí el canonical,
el precio y la URL exacta de imagen con cada Offer.

La [prueba oficial de Google por URL](https://search.google.com/test/rich-results/result?id=qdVj7K9RYTPiNS1q64u1hg)
sobre el preview anterior recibió la página de login de Vercel con `noindex`,
no la ficha. En [modo Código](https://search.google.com/test/rich-results/result?id=fcCrKPQiXJjGzo2j0_eTzw),
un fixture sintético derivado del schema del PR produjo un Product snippet y
dos Merchant listings válidos, con avisos opcionales; no valida el HTML
servido ni datos de catálogo real. Se preparó una muestra generada por el PR
con el catálogo público real, pero no se completó su envío al validador:
**Google Rich Results con datos reales no verificado en este corte**. La
[ficha de producción actual](https://search.google.com/test/rich-results/result?id=1aehkweV1m6gLolTcnD-vQ)
dio cero resultados enriquecidos y sirve solo como línea base anterior al
PR. La prueba Rich Results por URL del PR y la verificación en producción
continúan pendientes. **NO-GO se conserva.**

## Seguimiento del 20 de octubre — preview público del SHA `10898c7`

El deployment `dpl_8Zesoeot7QbrwZztKyqVuEscPHM2` del último commit del
[PR #40](https://github.com/specialcowboy69/tienda-online-camisetas/pull/40)
quedó `READY`; el commit `10898c7` solo cambia documentación respecto al
código corregido en `5661316`. Al reconsultar la configuración del proyecto,
`ssoProtection.enabled=false` y `passwordProtection.enabled=false`. El
[sitemap del preview](https://tienda-online-camisetas-fzlho3rz1-specialcowboy69s-projects.vercel.app/sitemap.xml)
respondió 200 por GET público, sin sesión. Esta apertura afecta a los
deployments cubiertos por la configuración del proyecto; no equivale a un
despliegue de la rama en producción.

Se ejecutó `runAudit` de `scripts/verify-seo.mjs` con un adaptador en memoria
que mapea exclusivamente las URLs permitidas de `http://127.0.0.1` al origen
fijo de ese preview, manteniendo GET, rechazo de redirecciones y el resto de
las comprobaciones del gate. Resultado: **32 GET, exit 0, cero fallos**.
Incluyó cuatro páginas estáticas, tres operativas con noindex, cinco PDP,
dos variantes por PDP, 404, queries de tracking, robots y sitemap. Pasaron
canonical limpio, titles/H1, comparación sitemap-catálogo y precio e imagen
inicial de las diez variantes muestreadas frente al Offer y Product hijo.
El gate registró su límite explícito: dos muestras HTTP por ficha entre 130
Offers totales; la comprobación local separada había cotejado los 130 con
el catálogo público de origen. El CLI normal no admite el host de Vercel;
este adaptador no modifica el script ni consulta rutas fuera de su allowlist.

La [prueba oficial de Google sobre la URL real del preview](https://search.google.com/test/rich-results/result?id=yB2UxBBM6EdXZ4e6uDalXQ)
obtuvo la ficha: rastreo permitido y descarga correcta. Detectó **1
fragmento de producto, 35 fichas de comerciante y 1 breadcrumb válidos**.
Los avisos de Merchant listings por descripción de variante, disponibilidad,
política de devolución y envío son opcionales; no se añadieron datos no
acreditados para eliminarlos. La misma prueba indica que la URL no es
indexable por `X-Robots-Tag: noindex` servido en el preview de Vercel.
El [Schema.org Validator sobre esa URL](https://validator.schema.org/#url=https%3A%2F%2Ftienda-online-camisetas-fzlho3rz1-specialcowboy69s-projects.vercel.app%2Fproducts%2Ffalling-apart-cat-graphic-tee)
leyó el HTML real y detectó ProductGroup y BreadcrumbList con **0 errores y
0 advertencias**. Estos resultados validan una muestra del preview, no
indexación ni rich results de producción.

La herramienta `web_fetch_vercel_url` del plugin aún devolvió 403 en
`GET /v2/deployments/{id}/aliases` para este deployment, incluso estando
ahora público; es una limitación independiente de su conexión. El GET
público directo y los validadores externos sí pudieron leer el preview.
Permanecen pendientes la integración del PR, la verificación en producción
tras cualquier merge, el envío a GSC y los demás gates comerciales de la
checklist. **NO-GO se conserva.**
