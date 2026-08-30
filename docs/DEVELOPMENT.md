# Desarrollo

## Objetivo de esta guia

Esta guia describe como trabajar en el proyecto sin romper flujos sensibles como pagos, pedidos, webhooks o secretos.

## Primer arranque

1. Instala Node.js 20 o superior.
2. Instala dependencias:

```powershell
npm.cmd install
```

3. Copia `.env.example` a `.env.local`.
4. Rellena variables locales con valores de prueba.
5. Arranca el servidor:

```powershell
npm.cmd run dev
```

## Comandos habituales

```powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Para revisar dependencias productivas:

```powershell
npm.cmd audit --omit=dev
```

## Flujo de ramas

- `main` representa la rama estable.
- No hacer push directo a `main`.
- Crear ramas de trabajo, por ejemplo `codex/textos-espanol`.
- Abrir Pull Request contra `main`.
- Mergear solo despues de revisar cambios y verificaciones.

## Como cambiar codigo

Para fixes o comportamiento nuevo:

1. Escribe o ejecuta una prueba/verificacion que falle con el comportamiento actual.
2. Haz el cambio minimo.
3. Ejecuta la prueba concreta hasta verla pasar.
4. Ejecuta la suite completa antes de cerrar.
5. Si toca seguridad, webhooks, pagos o dependencias, pide/revisa code review.

## Como anadir un endpoint

Checklist minimo:

- Validar autenticacion si no es publico.
- Si es publico, aplicar rate limit antes de trabajo costoso.
- Limitar tamano de entrada si lee JSON del cliente.
- Validar datos con Zod.
- Devolver errores consistentes con `jsonError`.
- Evitar llamar a Stripe, Printful, Firestore o Resend si la peticion ya es invalida.
- Anadir tests de ruta o de helper segun el riesgo.

## Como tocar pedidos o pagos

Los pedidos son la parte mas sensible del proyecto.

Antes de cambiar `src/lib/order-service.ts`, `src/lib/stripe.ts`, `src/app/api/webhooks/stripe` o flujos Printful:

- Leer el flujo completo de checkout y webhook.
- Cubrir casos de importe, moneda y direccion.
- Mantener idempotencia de webhooks.
- Evitar enviar pedidos reales a Printful salvo que `ORDER_CONFIRM_PRINTFUL=true` sea una decision consciente.
- Probar primero en modo test/sandbox.

## Como tocar emails

Los emails viven en `src/lib/email.ts`.

Al cambiar textos:

- Mantener version texto plano y HTML.
- Revisar tono en espanol.
- No incluir datos sensibles innecesarios.
- Mantener idempotency keys para evitar duplicados.
- Probar sin `RESEND_API_KEY` para confirmar que el flujo no se rompe cuando emails estan desactivados.

## Como tocar dependencias

No usar `npm audit fix --force` sin plan.

Proceso recomendado:

1. Ejecutar `npm.cmd audit --omit=dev`.
2. Separar fixes no breaking de upgrades mayores.
3. Probar upgrades en una rama dedicada.
4. Ejecutar test, lint, typecheck y build.
5. Documentar riesgos que queden diferidos.

Actualmente quedan vulnerabilidades que requieren upgrades mayores de Next/Firebase Admin. Conviene tratarlas como una tarea dedicada.
