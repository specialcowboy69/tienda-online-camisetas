# AGENTS.md

## Objetivo del proyecto

Este repositorio contiene una tienda online de camisetas construida con Next.js, Firestore, Stripe Checkout, Printful y Resend.

La prioridad es avanzar hacia una version lista para produccion con cambios pequenos, revisables y seguros. La persona propietaria del proyecto esta aprendiendo, asi que las respuestas deben explicar decisiones importantes en lenguaje claro, sin ocultar riesgos tecnicos.

## Forma de trabajar

- No empujes cambios a `main` directamente.
- Trabaja en ramas de feature, preferiblemente con prefijo `codex/`.
- Crea Pull Requests contra `main` para integrar cambios.
- Antes de tocar codigo, entiende el flujo real de extremo a extremo.
- Reutiliza patrones existentes del proyecto antes de crear abstracciones nuevas.
- Mantén los cambios pequenos e incrementales.
- No incluyas artefactos de proceso en commits, como `.superpowers/`.
- Si el arbol de git ya tiene cambios ajenos, no los reviertas ni los mezcles sin permiso.

## Auditoria obligatoria antes de Pull Requests y merges

Antes de crear un Pull Request, declarar que una rama esta lista para revision o
mergear cualquier Pull Request, es obligatorio comprobar el estado completo de
integracion del repositorio. No asumas que el PR actual es el unico trabajo
pendiente.

1. Ejecuta `git fetch origin --prune` para trabajar con referencias remotas
   actuales.
2. Lista todos los Pull Requests abiertos y revisa para cada uno su rama base,
   rama head, checks, estado de merge y posibles conflictos.
3. Inventaria las ramas locales y remotas que tengan commits no contenidos en
   `origin/main`. Distingue trabajo real pendiente de ramas antiguas ya
   integradas.
4. Revisa los worktrees registrados, los cambios sin commit y los commits sin
   push que puedan necesitar una rama o un Pull Request.
5. Informa antes de integrar:
   - PRs pendientes y sus bloqueos;
   - ramas que necesitan crear o actualizar un PR;
   - cambios locales o commits aun no publicados;
   - el orden de integracion cuando existan dependencias entre trabajos.
6. No crees un PR duplicado. Si ya existe uno para la rama o el mismo cambio,
   actualiza ese PR.
7. No mezcles automaticamente trabajo pendiente ajeno o no relacionado. Su
   existencia debe informarse, pero solo bloquea el merge actual si es una
   dependencia, provoca conflictos o altera la verificacion del cambio.
8. Justo antes del merge, confirma sobre el SHA exacto que la base es `main`,
   que los checks y verificaciones obligatorias estan en verde, que el PR es
   mergeable y que no aparecieron nuevos pendientes relevantes.
9. Despues del merge, confirma el estado `MERGED`, verifica que el commit esta
   contenido en `origin/main` y, si aplica, comprueba el deployment real.
10. La respuesta final debe incluir una seccion `Pendiente por integrar` con la
    lista actual, o indicar expresamente `Nada pendiente`.

Comandos de referencia para esta auditoria:

```powershell
git fetch origin --prune
gh pr list --state open
git branch -vv
git worktree list
git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/codex/*'
```

Si `gh` no esta disponible, usa la API o interfaz de GitHub equivalente. La
ausencia de una herramienta concreta no elimina la obligacion de auditar.

## Superpowers

Usa las skills de Superpowers cuando encajen:

- `test-driven-development`: para fixes, seguridad y comportamiento nuevo. Primero test/verificacion roja, luego implementacion, luego verde.
- `systematic-debugging`: si aparece un fallo inesperado o un comportamiento confuso.
- `writing-plans`: para tareas de varios pasos antes de modificar codigo.
- `executing-plans` o `subagent-driven-development`: para ejecutar planes por tareas.
- `requesting-code-review` y `receiving-code-review`: para cambios de seguridad, arquitectura o PRs relevantes.
- `verification-before-completion`: antes de afirmar que algo esta terminado.
- `finishing-a-development-branch`: para decidir si mergear, crear PR o dejar la rama.

## Verificacion obligatoria

Antes de cerrar una tarea de codigo, ejecuta:

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Para cambios de dependencias o seguridad, ejecuta tambien:

```powershell
npm.cmd audit --omit=dev
```

Si `npm audit` falla por upgrades mayores, no uses `--force` sin plan y aprobacion explicita.

## Seguridad

- No pegues secretos reales en codigo, tests, docs o commits.
- No rotes ni cambies secretos de produccion sin permiso explicito.
- Trata como sensibles: `ADMIN_SECRET`, `CRON_SECRET`, `PRINTFUL_API_TOKEN`, `PRINTFUL_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `FIREBASE_PRIVATE_KEY` y `RESEND_API_KEY`.
- Los endpoints publicos deben validar entrada, limitar abuso y fallar antes de llamar a servicios externos cuando sea posible.
- Los webhooks deben verificar autenticidad antes de leer/procesar el cuerpo.

## Prioridades actuales

Consultar primero `docs/LAUNCH_CHECKLIST.md`: es la referencia de estado y
evidencia. `docs/ROADMAP.md` ordena prioridades y `docs/operations.md` describe
procedimientos; no reconstruir pendientes desde listas historicas aisladas.

Al cierre documental del 12 de octubre de 2026 estan integrados el control UE
#27, las alertas #29 (desactivadas) y el registro de stock #31. Hay E2E Stripe
test posterior a #27, pending real, recuperacion de email y cancelacion de dos
borradores. Las capturas del propietario acreditan dos correos recibidos en Gmail;
product_updated autentico y restauracion estan verificados en Firestore. Esto
no acredita pagos live, fabricacion, stock_updated ni envio/tracking reales.

1. Completar y revisar las plantillas legales y el canal de soporte antes de
   publicar las paginas; no rellenar datos del negocio por suposicion.
2. Mantener US/ES/FR/DE/IT/PT como alcance acordado y CA/GB bloqueados. No
   desactivar la comprobacion UE ni prometer DDP para desbloquear una seleccion.
3. Conservar la vigilancia manual. Las alertas estan desplegadas desactivadas;
   indice, pruebas remotas y activacion siguen pendientes. Codex no supervisa
   en segundo plano sin un mecanismo explicito.
4. Revisar accesos, secretos y riesgo residual con `docs/SECURITY.md`. La
   aceptacion fechada no cubre avisos nuevos ni significa que esten corregidos.
5. Mantener Stripe Tax desactivado. El trabajo fiscal y la compra real estan
   aplazados, no completados. Retomar su alcance con permiso; no cambiar `NO-GO`
   a `GO`. Las capturas de dos correos no validan el buzon de soporte ni tracking.
6. Verificar configuracion vigente, eventos pendientes y evidencias de despliegue
   antes de cualquier futura activacion live o de fabricacion.

Tras integrar cambios funcionales, registrar en la checklist fecha, PR/SHA,
deployment y alcance real de pruebas. Conservar el historial sin dejar una
implementacion desplegada descrita como pendiente de PR. Distinguir pruebas
locales, cotizaciones publicas y acciones con efectos; no cerrar una tarea con
evidencia de otra. Una revision solo documental no activa servicios ni publica
plantillas legales. Evitar incluir snapshots volatiles de PRs abiertos en varias
guias: auditar GitHub de nuevo antes de integrar.

La documentacion interna puede seguir en espanol si ayuda a operar y aprender,
pero cualquier texto visible para cliente debe tratarse como ingles por defecto.
