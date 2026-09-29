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

Los puntos 1 y 2 del roadmap estan completados o en proceso:

1. Webhook de Printful hacia Vercel: protegido y pendiente de prueba real en Vercel.
2. Resend: integrado para emails transaccionales, pendiente de configuracion fina/dominio si aplica.

Siguientes prioridades practicas:

1. Mantener la tienda publica y emails en ingles con tono de marca `No Context Club`.
2. Cambiar/rotar secretos fuertes si alguno se uso durante pruebas.
3. Anadir dominio final en Vercel y ajustar `NEXT_PUBLIC_BASE_URL`.
4. Crear paginas legales: privacidad, devoluciones, contacto y condiciones.
5. Pasar Stripe a live solo cuando lo anterior este cerrado.
6. Validar fiscalidad antes de activar Stripe Tax.
7. Hacer una compra real controlada con `ORDER_CONFIRM_PRINTFUL=true`.

La documentacion interna puede seguir en espanol si ayuda a operar y aprender,
pero cualquier texto visible para cliente debe tratarse como ingles por defecto.
