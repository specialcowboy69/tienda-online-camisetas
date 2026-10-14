# Entrega de borradores legales y textos PDP — 14 de octubre de 2026

## Alcance integrado

- [PR #34](https://github.com/specialcowboy69/tienda-online-camisetas/pull/34),
  merge `23c49402a311d8e7eccdbdcfd8ee0c91edfb6892`, confirmado en `origin/main`.
- Head revisado `7322a4a7456f887f620f77909a23c29878d8a997`; árbol
  `a78b19a72b8b1dd53fe0cef6cfe48fe4e18e47b0`, idéntico al merge.
- Actualización de la rama existente con `main`, conservando el commit original
  y resolviendo la checklist sin perder la evidencia GA4 de #35.
- Once archivos: texto público de PDP y test, procedimiento interno, checklist
  y plantillas legales. No se publican páginas legales ni placeholders.
- Incidencia confirmada de fabricación/tienda: reposición sin coste o reembolso
  sin exigir devolución/recogida; desistimiento y derechos legales separados.
- Estimación general de producción de 2–5 días laborables, transporte adicional
  dependiente de la opción; no se verifican nuevas rutas ni se promete DDP.
- Privacidad/cookies reflejan GA4 implementado apagado y Cookie settings. Ads no
  implementado, inventario del SDK real y activación aún pendientes.

## Verificación previa al merge

| Comprobación | Resultado y límite |
| --- | --- |
| `npm.cmd test` | 773/773 en 48 archivos |
| `npx.cmd tsc --noEmit --incremental false` | Exit 0 |
| `npm.cmd run build` | Exit 0, Analytics desactivado |
| `npm.cmd run lint` en checkout | Cuatro errores preexistentes `no-require-imports` en dos helpers ignorados `.superpowers`; no modificados ni incluidos |
| Mismo comando lint en exportación Git limpia del árbol exacto | Exit 0; mismas dependencias instaladas, sin cambios de lockfile ni configuración ESLint |
| `git diff --check` | Exit 0 |
| Revisión independiente | Once archivos revisados, sin bloqueos técnicos; no certificación jurídica |
| Navegador sobre build local | Seis casos home/catálogo/PDP a 390/1440 px; textos y ajustes OFF correctos |

La primera suite, ejecutada en paralelo con build/lint, tuvo un timeout de
15 segundos en el caso CA de `validation.test.ts`. Sin cambios de código ni
timeouts, el archivo pasó 9/9 y la suite posterior 773/773 sin build concurrente.
Se registra la incidencia; no se atribuye un fallo funcional al cambio de copy.

La copia temporal limpia usada para lint se eliminó tras retirar su junction;
las dependencias y los helpers del checkout permanecen intactos.

## Preview y producción

Preview del head: `dpl_8qkTafm7BeywbjYeXsRfT5KqHGhQ`, READY. Lectura del PDP
con `vercel curl` autenticado devolvió 200 y verificó los textos de solución sin
retorno, producción estimada y Cookie settings, sin marcadores `TO COMPLETE`.
No se cambió Deployment Protection ni se descargaron secretos.

Producción:

- GitHub deployment `7065034222` asocia el SHA de merge al deployment Vercel;
  estado `success`, 14 de octubre a las 12:16:58 UTC.
- `dpl_Gx9B9rUCt51j3ZTeQoGeHEtdYaqg`, READY, target `production`.
- URL inmutable: `https://tienda-online-camisetas-cvz7df1as-specialcowboy69s-projects.vercel.app`.
- `vercel inspect www.funnyteesforall.com` resolvió ese mismo deployment.
- Navegador público: `/`, `/products` y
  `/products/falling-apart-cat-graphic-tee`, en 390 y 1440 px: seis respuestas 200.
- Acordeones Shipping y Returns and product issues abiertos, copy actualizado
  visible, sin overflow horizontal; capturas móvil/escritorio inspeccionadas.
- Cookie settings muestra Analytics OFF; sin checkbox para habilitarlo,
  sin botón Accept ni script GA4, incluso sembrando aceptación previa local.
- Resultado: `passed=6`, `googleRequests=0`, `commercialWrites=0`, `blockedWrites=0`.
  El navegador bloqueó por diseño APIs y métodos distintos de GET/HEAD.

Artefactos locales ignorados: `output/playwright/legal-delivery/`, con script,
resúmenes JSON y capturas. No son archivos necesarios para ejecutar la tienda.
No se copia su contenido ni credenciales a Git.

## Auditoría de integración y límites

Antes del merge: referencias remotas refrescadas, únicamente #34 abierto,
base `main`, head exacto `7322a4a`, mergeable y checks Vercel/Preview Comments
correctos. Solo su rama tenía commits pendientes; checkout primario limpio,
sin otros worktrees ni commits ajenos sin publicar. Merge normal, sin force-push.

Este cierre verifica despliegue y copy, no completa las plantillas ni acredita
cumplimiento legal. Identidad, conservación, transferencias, inventario real,
soporte y publicación siguen pendientes. No activa Analytics, Ads, Tax, pagos
live, fabricación o alertas, ni altera los controles de envío. No se crean
pedidos, emails o reembolsos; no se repiten pruebas de proveedores. `NO-GO`
permanece vigente.
