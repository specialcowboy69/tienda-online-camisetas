# EU Customs Checkout Guard Implementation Plan

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../../LAUNCH_CHECKLIST.md).


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir iniciar pagos hacia los cinco destinos UE activos cuando el método de envío cotizado indique riesgo de aduanas o no pueda verificarse, conservando US y los precios actuales.

**Architecture:** Mantener `/shipping/rates` v1 para precios y añadir `/v2/shipping-rates` como comprobación aduanera por paquete y método para UE. Compartir una política pura entre cotización y creación de checkout, con respuestas comerciales tipadas y una UI que descarte tarifas antiguas. No modificar la creación de pedidos Printful ni los controles posteriores al pago.

**Tech Stack:** Next.js 15 / App Router, TypeScript, React 19, Zod 3, Firestore, Stripe Checkout, Printful v1/v2, Vitest en Node, PowerShell y Node >=22.12.0. Sin dependencias nuevas.

**Spec:** [Diseño de control preventivo UE](../../../superpowers/specs/2026-10-11-eu-customs-guard-design.md). Leer ambos documentos antes de ejecutar.

## Global Constraints

- Implementacion autorizada y realizada localmente desde `fed72dc` el 2026-10-11; pendiente de integracion y deployment.
- Destinos protegidos exactamente `ES`, `FR`, `DE`, `IT`, `PT`; US sigue el flujo actual; CA/GB continúan deshabilitados.
- Standard permanece a `0.00` para US/ES/FR/DE/IT/PT; `PRINTFUL_FAST` a `0.00` solo para US; no cambiar precios de producto ni repercutir nuevamente ese transporte.
- Mantener `STRIPE_TAX_ENABLED=false` y no alterar `ORDER_CONFIRM_PRINTFUL`, credenciales ni configuración desplegada durante pruebas.
- Datos de productos desde Firestore y configuración de impresión desde Printful; fixtures exclusivamente para tests. Nunca inventar una técnica para conseguir una respuesta v2.
- Texto público en inglés sin mencionar al proveedor, fábrica fija, DDP garantizado o ausencia garantizada de aduanas.
- Trabajar en `codex/`, preservar todos los archivos ajenos; auditoría completa de `AGENTS.md` antes de PR, declarar la rama lista o mergear. Este plan no autoriza por sí solo un merge/deployment.
- No modificar el modelo `CatalogProduct`/`CatalogVariant`, el hash de pago ni los estados de fulfillment; ningún reembolso, cobro o pedido de fabricación durante la verificación prevista.
- Verificación obligatoria futura: `npm.cmd test`, `npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run build`.

## Review Focus

1. Paquetes divididos, artículos repetidos y cantidades: todos deben quedar cubiertos; una respuesta parcial nunca permite pagar (tareas 1 y 2).
2. Señal ausente o mal tipada, métodos duplicados y moneda inconsistente: distinguir desconocido de `false` sin deducir riesgo por país de salida (tareas 1 y 2).
3. Una tarifa cambia entre cotización y Stripe, o el cliente llama directamente a checkout: rechazar antes de Firestore/Stripe (tarea 3).
4. Una respuesta asíncrona llega después de cambiar talla, dirección o carrito: ignorarla, incluidos sus errores y finalización de loading (tarea 4).
5. API v2 caída o configuración de impresión no soportada: UE puede reintentar, US no adquiere esa dependencia y CA/GB siguen rechazados antes del proveedor (tareas 1 y 3).

## Mapa de archivos y dependencias

| Unidad | Archivos |
| --- | --- |
| Contrato y adaptador Printful | Modificar `src/lib/printful.ts`, `src/lib/printful.test.ts`; crear `src/lib/printful-shipping-risk.ts`, `src/lib/__fixtures__/printful-shipping-risk.ts` |
| Regla por destino/método y errores | Crear `src/lib/shipping-eligibility.ts`, `src/lib/shipping-eligibility.test.ts`; registrar el test en `package.json` |
| Integración servidor | Modificar `src/lib/order-service.ts`, `src/lib/http.ts`, sus tests; crear `src/lib/shipping-eligibility-routes.test.ts` y registrarlo en `package.json` |
| UI y copia | Modificar `src/components/product-purchase-panel.tsx`, su test, `src/components/storefront.tsx`, `src/lib/product-content.ts`, su test; crear/registrar `src/components/storefront.test.tsx` |
| Operación y documentación | Modificar `docs/ARCHITECTURE.md`, `docs/operations.md`, `docs/LAUNCH_CHECKLIST.md`, `docs/legal-templates/shipping-policy.md`, `docs/legal-templates/printful-fulfillment-matrix.md` y la descripción de países/envíos en `README.md` |

Orden: tarea 1 -> tarea 2 -> tarea 3 -> tarea 4 -> tarea 5. Se pueden investigar
o preparar pruebas independientes en paralelo con contextos separados; integrar
solo cuando los contratos anteriores existan. Un agente es propietario de cada
archivo durante las ediciones. El coordinador mantiene las firmas siguientes.

---

### Task 1: Obtener evidencia aduanera v2 de las prendas reales

**Files:** `src/lib/printful.ts`, `src/lib/printful.test.ts`, nuevos `src/lib/printful-shipping-risk.ts` y `src/lib/__fixtures__/printful-shipping-risk.ts`.

**Interfaces:**

Definir en `printful-shipping-risk.ts` (módulo puro, sin secretos ni red):

```ts
export type ShippingRiskItem = { variantId: number; quantity: number };
export type ShippingRiskShipment = {
  departureCountry: string | null;
  items: ShippingRiskItem[];
  customsFeesPossible: boolean | null;
};
export type ShippingRiskRate = {
  id: string;
  currency: string;
  shipments: ShippingRiskShipment[];
  valid: boolean;
};
export type ShippingRiskPlacement = { placement: "front_dtf"; technique: "dtfilm" };
export function readShippingRiskRates(payload: unknown): ShippingRiskRate[];
```

Producir en `printful.ts`:

```ts
export async function getShippingRiskRates(
  recipient: Recipient, items: OrderItem[]
): Promise<ShippingRiskRate[]>;
```

El getter obtiene configuración de impresión, llama v2 y normaliza. El parser
preserva como `null` el flag ausente/mal tipado y como `valid:false` un método cuya
estructura no sea verificable. Una raíz que no contiene `data` array produce error
de contrato. Los detalles de respuestas externas no se envían al navegador.

- [x] **Step 1: Preparar el checkout de implementación.**
  Usar `superpowers:using-git-worktrees` para un worktree aislado con rama
  `codex/eu-customs-guard` desde origin/main actualizado. Llevar solo este plan y
  su spec; conservar los documentos locales anteriores en su ubicación. Ejecutar
  `npm.cmd ci` con el lockfile de ese checkout antes de cualquier test. Confirmar
  que la rama base mantiene las firmas inspeccionadas y registrar diferencias.

- [x] **Step 2: Renovar el contrato con lecturas y cotizaciones sin pedidos.**
  Consultar los cinco productos reales de Firestore y `GET /store/products/{id}`;
  verificar ID sincronizado, `variant_id`, archivos de impresión y options de cada
  variante muestreada. Para configuración frontal DTF confirmada, enviar v2 con
  `source:"catalog"`, `catalog_variant_id`, `quantity`, `placements:[{placement:
  "front_dtf",technique:"dtfilm"}]`, misma dirección y moneda que v1. Conservar fixtures
  mínimos de una opción apta, una con riesgo, una mixta y los metadatos que prueban
  `front_dtf`/`dtfilm`. Excluir imágenes/URLs privadas, email, teléfono, dirección,
  tokens y datos de pedidos; anotar fecha, fuente y campos omitidos en el fixture.
  Si la configuración observada no admite esa correspondencia, finalizar esta
  comprobación documentando la incompatibilidad y ajustar el diseño antes de
  conectar el bloqueo. No omitir placements ni suponer DTG como alternativa.

- [x] **Step 3: Añadir pruebas rojas en `printful.test.ts`.**
  Usar los fixtures de Step 2 y versiones sintéticas con campos eliminados.
  Los tests tendrán estos nombres/contratos:

  ```ts
  // reads every shipment in the v2 data envelope
  expect(readShippingRiskRates(mixedPayload)[0].shipments
    .map(s => s.customsFeesPossible)).toEqual([false, true]);
  // never converts absent or string customs signals to false
  expect(readShippingRiskRates(missingFlagPayload)[0].shipments[0]
    .customsFeesPossible).toBeNull();
  // quotes the exact sync variants with their verified front DTF placements
  expect(v2Body.order_items).toEqual(expectedCatalogItemsWithFrontDtfilm);
  // rejects a sync/catalog identity mismatch or an unsupported print file
  await expect(getShippingRiskRates(recipient, items)).rejects.toThrow();
  ```

  Añadir aserciones sobre dirección completa (incluida `address2`), moneda, carrito
  entero, dos diseños con el mismo blank, deduplicación de lectura por producto,
  archivos preview ignorados y cualquier otra impresión desconocida rechazada.
  Simular 429, 5xx, cuerpo ilegible y timeout; ninguna prueba llama al proveedor.

- [x] **Step 4: Confirmar RED.**
  Ejecutar `npx.cmd vitest run --environment node --testTimeout 15000 src/lib/printful.test.ts`.
  Debe fallar por el contrato/getter aún ausente, no por red o credenciales.

- [x] **Step 5: Implementar parser y getter.**
  Reutilizar `printfulFetch`, auth/store header y `toPrintfulRecipient`; mantener
  `getShippingRates()` v1 intacto. Leer cada producto distinto una vez, con máximo
  tres lecturas simultáneas. Resolver exclusivamente los `syncVariantId` pedidos y
  comprobar que su blank coincide con el `OrderItem.variantId` de Firestore.
  Aceptar solo archivos imprimibles `front_dtf` confirmados como front_dtf/dtfilm;
  preview no cuenta, y ausencia, otras técnicas o placements no soportados causan
  comprobación no disponible. Pasar todas las líneas a una única llamada v2.
  Límite global de 20 segundos para el getter (metadatos y v2 juntos), propagado
  con `AbortSignal` a las lecturas. Sin reintentos internos ni caché persistente.
  Normalizar `shipping` -> `id`, currency a minúsculas y todos los paquetes.

- [x] **Step 6: Confirmar GREEN.**
  Repetir el comando de Step 4; todas las pruebas de Printful deben pasar.

- [x] **Step 7: Guardar el adaptador acotado.**
  `git add src/lib/printful.ts src/lib/printful.test.ts src/lib/printful-shipping-risk.ts src/lib/__fixtures__/printful-shipping-risk.ts`
  y `git commit -m "feat: read Printful shipment customs evidence"`.

### Task 2: Definir elegibilidad por método sin alterar precios

**Files:** nuevos `src/lib/shipping-eligibility.ts`, `src/lib/shipping-eligibility.test.ts`; `package.json`.

**Interfaces:** consume `OrderItem`, `ShippingRate` y `ShippingRiskRate` de tarea 1.

```ts
export type ShippingEligibilityStatus = "eligible" | "customs_risk" | "unverified";
export type ShippingRateDecision = { rateId: string; status: ShippingEligibilityStatus };
export function isEuCustomsGuardCountry(countryCode: string): boolean;
export function evaluateShippingEligibility(
  countryCode: string, items: OrderItem[], rates: ShippingRate[],
  riskRates: ShippingRiskRate[]
): ShippingRateDecision[];
export type ShippingEligibilityCode =
  "EU_CUSTOMS_RISK" | "SHIPPING_CHECK_UNAVAILABLE" | "SHIPPING_OPTIONS_CHANGED";
export class ShippingEligibilityError extends Error {
  readonly code: ShippingEligibilityCode;
  readonly status: 409 | 503;
  constructor(code: ShippingEligibilityCode);
}
```

- [x] **Step 1: Añadir tests rojos parametrizados y registrar el archivo en `npm test`.**
  Probar cada destino ES/FR/DE/IT/PT, normalización del código y US. Crear en el
  propio test fixtures tipados `items`, `rates`, `safeRiskRates`, `mixedRiskRates`.

  ```ts
  expect(evaluateShippingEligibility("ES", items, rates, safeRiskRates))
    .toEqual([{ rateId: "STANDARD", status: "eligible" }]);
  expect(evaluateShippingEligibility("ES", items, rates, mixedRiskRates))
    .toEqual([{ rateId: "STANDARD", status: "customs_risk" }]);
  expect(evaluateShippingEligibility("ES", items, rates, []))
    .toEqual([{ rateId: "STANDARD", status: "unverified" }]);
  expect(evaluateShippingEligibility("US", items, rates, []))
    .toEqual([{ rateId: "STANDARD", status: "eligible" }]);
  ```

  Casos adicionales: falta una línea, paquete vacío, cantidades insuficientes o
  excesivas, artículo adicional, cantidades cero/no enteras, variante repetida
  repartida en dos paquetes, flag null/string, ID de método duplicado en v1 o v2,
  moneda distinta, salida null con flag false, y dos métodos con decisiones distintas.
  Afirmar que los objetos de precios originales no se modifican.

- [x] **Step 2: Confirmar RED.**
  `npx.cmd vitest run --environment node src/lib/shipping-eligibility.test.ts`.
  Esperado: fallos por función no implementada.

- [x] **Step 3: Implementar la regla pura y los errores.**
  Set exacto ES/FR/DE/IT/PT; comparar IDs con trim/uppercase y moneda lowercase.
  Para cada método v1 exigir contraparte v2 única y estructura válida. Comparar
  los mapas de suma de cantidades por variantId del carrito y de todos los paquetes;
  después exigir booleanos explícitos. Solo entonces cualquier `true` produce
  `customs_risk`; todos false producen `eligible`. Cualquier incumplimiento produce
  `unverified`. US devuelve eligible sin consultar datos v2.
  El constructor fija los tres textos ingleses de la spec, códigos y estados:
  risk/options_changed = 409; check_unavailable = 503.

- [x] **Step 4: Confirmar GREEN.**
  Repetir Step 2 y comprobar salida0.

- [x] **Step 5: Commit de la política.**
  `git add src/lib/shipping-eligibility.ts src/lib/shipping-eligibility.test.ts package.json`
  y `git commit -m "feat: define EU shipping eligibility policy"`.

### Task 3: Aplicar la regla antes de persistir o iniciar Stripe

**Files:** `src/lib/order-service.ts`, `src/lib/order-service.test.ts`, `src/lib/http.ts`, `src/lib/http.test.ts`, nuevo `src/lib/shipping-eligibility-routes.test.ts`, `package.json`.

**Interfaces:** conservar firmas públicas de `quoteShipping` y `createCheckout`.
Crear helper privado en `order-service.ts`:

```ts
async function resolveShippingOptions(
  recipient: Recipient, items: OrderItem[]
): Promise<{ rates: ShippingRate[]; decisions: ShippingRateDecision[] }>;
```

Respuesta de error pública: `{ error: string, code: ShippingEligibilityCode }`.
Respuesta exitosa de rates sigue `{ rates: ShippingRate[] }`; checkout conserva
`{ orderId, checkoutUrl }`. No añadir al schema de entrada flags del cliente.

- [x] **Step 1: Añadir tests rojos del servicio.**
  Mockear `getShippingRiskRates` además del getter v1 existente y verificar:

  ```ts
  // rejects a risky EU checkout before any durable or payment side effect
  await expect(createCheckout(input)).rejects.toMatchObject({ code: "EU_CUSTOMS_RISK" });
  expect(createOrder).not.toHaveBeenCalled();
  expect(createStripeCheckoutSession).not.toHaveBeenCalled();
  // preserves included Standard pricing after a successful customs check
  expect((await quoteShipping(input))[0].rate).toBe("0.00");
  // US does not depend on the EU-only provider call
  await quoteShipping(usInput);
  expect(getShippingRiskRates).not.toHaveBeenCalled();
  ```

  Cubrir cinco destinos UE, carrito mixto, opción segura junto a otra riesgosa,
  riesgo/desconocido sin opciones aptas, selected ID desaparecido, selected ID con
  riesgo aunque quede otra opción apta, fallo v2 y cambio false->true entre llamadas.
  Una llamada directa a checkout también debe comprobar v2. Incluir schema .strict
  ante booleanos/precios forjados y conservar rechazo temprano CA/GB.

- [x] **Step 2: Añadir tests rojos de HTTP/rutas y registrarlos.**
  `http.test.ts` verifica status409/503 y `code`, sin details/token/payload del
  proveedor. El nuevo test de rutas invoca ambos POST reales con servicios mock:
  `expect(response.status).toBe(409)` y
  `expect(await response.json()).toMatchObject({code:"EU_CUSTOMS_RISK"})`.
  Repetir para503 y mantener body-size/rate-limit/invalid-input.

- [x] **Step 3: Confirmar RED.**
  `npx.cmd vitest run --environment node --testTimeout 15000 src/lib/order-service.test.ts src/lib/http.test.ts src/lib/shipping-eligibility-routes.test.ts`.

- [x] **Step 4: Integrar la decisión compartida.**
  Después de validar país y reconstruir artículos reales, obtener v1 y, solo para
  UE, v2; pueden ejecutarse en paralelo. Un error del getter de riesgo se traduce
  a SHIPPING_CHECK_UNAVAILABLE, con diagnóstico interno sanitizado, sin fallback
  que permita pagar. No capturar ni reinterpretar errores ajenos a ese getter.
  `quoteShipping` filtra métodos elegibles y luego aplica `priceCustomerShippingRate`.
  Si v1 vacío usar OPTIONS_CHANGED; si no queda ninguno usar CHECK_UNAVAILABLE
  cuando haya desconocidos, y EU_CUSTOMS_RISK cuando todos sean riesgo.
  `createCheckout` repite todo y evalúa el ID solicitado: ausente OPTIONS_CHANGED,
  riesgo EU_CUSTOMS_RISK, desconocido CHECK_UNAVAILABLE. Nunca elegir otro ID.
  Solo después calcular totales/escribir/crear Stripe. `jsonError` mapea el error
  tipado; rutas conservan validación y limitadores. No guardar el booleano como
  prueba de autorización ni modificar StoreOrder, snapshotHash o fulfillment.

- [x] **Step 5: Confirmar GREEN con regresiones.**
  Repetir Step 3 y ejecutar
  `npx.cmd vitest run --environment node --testTimeout 15000 src/lib/checkout-calculator.test.ts src/lib/stripe.test.ts src/lib/public-api-body-size.test.ts src/lib/public-api-rate-limit.test.ts src/lib/validation.test.ts src/lib/order-safety.integration.test.ts`.
  Confirmar Standard0, FastUS0, país Stripe bloqueado al cotizado y controles de
  pedidos intactos.

- [x] **Step 6: Commit del control servidor.**
  Añadir solo los seis archivos de esta tarea y hacer commit
  `feat: enforce EU customs checks before checkout`.

### Task 4: Mostrar el bloqueo y evitar cotizaciones obsoletas en la UI

**Files:** `product-purchase-panel.tsx` y su test; `storefront.tsx`, nuevo `storefront.test.tsx`; `product-content.ts`, su test; `package.json`.

**Interfaces:** consumir `code`/`error` de tarea 3. Mantener props de ambos componentes.
Estado adicional local con `useRef<number>` para revisión de compra y solicitudes;
el mock React de tests debe conservar referencias entre renders manuales.

- [x] **Step 1: Escribir tests rojos por handlers reales.**
  Ampliar el arnés existente, permitir allowedCountries US/ES y simular fetch con
  promesas controlables. Para el Storefront reutilizar el mismo patrón en su nuevo
  test sin introducir una biblioteca DOM ni nueva ruta pública.

  ```ts
  // clears a formerly valid quote after EU_CUSTOMS_RISK from either endpoint
  expect(renderToStaticMarkup(renderPanel())).not.toContain("Pay with Stripe");
  expect(renderToStaticMarkup(renderPanel())).toContain('role="alert"');
  // never reinstalls a quote belonging to a previous address or variant
  resolveOldRatesResponse();
  await oldRequest;
  expect(renderToStaticMarkup(renderPanel())).not.toContain("Pay with Stripe");
  ```

  Añadir secuencias éxito->reconsulta fallida, país ES->US, talla/color, address2,
  contenido/cantidad de carrito antiguo, dos consultas resueltas al revés y error
  antiguo tras éxito nuevo. Comprobar selección/dirección conservadas tras error,
  nueva cotización apta que habilita pago, y controles deshabilitados mientras se
  crea Stripe. En `product-content.test.ts`, aserciones de inclusión condicionada
  a elegibilidad y ausencia de promesa de origen o aduanas garantizadas.

- [x] **Step 2: Confirmar RED y registrar el test nuevo.**
  `npx.cmd vitest run --environment node --testTimeout 15000 src/components/product-purchase-panel.test.tsx src/components/storefront.test.tsx src/lib/product-content.test.ts`.

- [x] **Step 3: Implementar invalidación y mensajes accesibles.**
  Vaciar rates/selectedRateId al iniciar recálculo y al fallar rates/checkout;
  conservar carrito y dirección. Incrementar revisión al cambiar cualquier dato
  de compra o al iniciar otra petición; comprobar token antes de todos los setters
  asíncronos y en finally. Cancelar peticiones obsoletas cuando sea posible, sin
  depender solo de abort. Durante checkout deshabilitar inputs, variantes y acciones
  que alteran la compra; comprobar vigencia antes de redirigir.
  Mostrar texto de spec con `role="alert"`, progreso con `role="status"`; usar code
  para invalidar el flujo, sin comparar frases. Mantener el mensaje genérico para
  otros errores. Aplicar la misma conducta al componente heredado sin activarlo.
  Actualizar únicamente el copy de envío en product-content con el texto de spec.

- [x] **Step 4: Confirmar GREEN.**
  Repetir Step 2 más `src/app/customer-language.test.ts`; registrar storefront.test
  en npm test.

- [x] **Step 5: Commit del flujo público.**
  Añadir solo los siete archivos de esta tarea y commit
  `feat: explain regional delivery restrictions before payment`.

### Task 5: Verificación, documentación y preparación de integración

**Files:** documentación enumerada en el mapa y las checkboxes de este plan.
**Interfaces:** consumir el comportamiento completo de tareas 1–4; no introducir
reglas nuevas ni modificar documentos históricos en `docs/superpowers/` ajenos.

- [x] **Step 1: Documentar regla y límites.**
  ARCHITECTURE: v1 precios + v2 riesgo, chequeo en rates/checkout, códigos.
  operations: diferencia risk/unavailable; reintentar después de corregir o de que
  vuelva el proveedor; nunca cambiar manualmente un false ni ofrecer un bypass.
  Documentar que una ruta puede cambiar tras crear Stripe y que cualquier
  intervención posterior se revisa en el flujo operativo existente, sin asegurar
  que se detecten todos los cambios. LAUNCH_CHECKLIST: pruebas específicas y estado
  real, sin marcar como verificado lo meramente diseñado. Plantilla de shipping:
  copy de spec, manteniendo su carácter de borrador y campos por rellenar.
  Matriz: añadir control dinámico y conservar fecha/snapshot anterior como histórico.
  README: corregir solo el resumen de mercados/envíos (CA/GB siguen deshabilitados).

- [x] **Step 2: Ejecutar verificaciones obligatorias una vez integrado.**
  Con las dependencias ya instaladas en tarea 1, ejecutar en orden:

  ```powershell
  npm.cmd test
  npm.cmd run lint
  npx.cmd tsc --noEmit --incremental false
  npm.cmd run build
  ```

  Esperado: código de salida0 en todos; nuevos tests incluidos. Si cambian
  dependencias o se amplía a seguridad, añadir `npm.cmd audit --omit=dev`; nunca
  resolver avisos con --force. No marcar build completo si falta entorno requerido.

- [x] **Step 3: Verificar visualmente móvil y escritorio.**
  Usar navegador a 390x844 y 1440x900: cinco casos, selección UE apta, riesgo,
  servicio no disponible, cambio de dirección durante respuesta lenta y retorno US.
  Las respuestas de error/race se simulan localmente; no inyectar fallos en producción.
  Comprobar alerta legible sin desbordamiento, orden de tabulación, loading anunciado,
  dirección conservada y botón pago no utilizable tras invalidar. No completar pagos.

- [x] **Step 4: Renovar comprobación real de solo lectura.**
  Desde entorno protegido de prueba, realizar cotizaciones con dirección completa
  de prueba para US/ES/FR/DE/IT/PT y selecciones reales: una apta UE, una que produzca
  riesgo si existe en ese momento y un carrito mixto. Confirmar importes v1 actuales,
  respuesta v2, cobertura y criterio local. Si el stock ya cambió, documentarlo y
  cubrir el caso de riesgo con fixture; no inventar que apareció en la consulta real.
  No usar `/orders`, `/orders/confirm`, nuevos cobros, emails o escrituras Firestore
  para este paso. Guardar evidencia sanitizada: fecha, variante, destino, ID método,
  decisión y modo de prueba. Revisar que el volumen no provoque429; sin bucles de retry.

- [x] **Step 5: Revisar el diff final y commit de documentación.**
  `git diff --check`; revisión independiente del contrato, cobertura completa de
  carrito, cero efectos al rechazar, regresiones US/precios y límites postpago.
  Añadir solo los cinco documentos operativos y README explícitos; commit
  `docs: describe EU customs checkout guard and verification`.

- [x] **Step 6: Auditar integración antes de PR o declarar lista la rama.**
  Ejecutar la auditoría completa de AGENTS.md: `git fetch origin --prune`, todos los
  PR abiertos con base/head/checks/conflictos, ramas locales/remotas no contenidas
  en origin/main, worktrees, archivos sin commit y commits sin push. Informar lista
  y dependencias; no mezclar los planes/documentos locales antiguos. Buscar PR
  existente antes de crear otro. Propuesta de título:
  `Prevent EU checkout when shipping quotes indicate possible customs charges`.

- [x] **Step 7: Entregar para revisión; integración y deployment cuando se soliciten.**
  Mostrar diff y evidencia. Si se autoriza merge, repetir control sobre SHA exacto,
  base main, checks, mergeable y pendientes relevantes; confirmar MERGED y commit
  contenido en origin/main. Verificar deployment y cotización pública real sin
  pagos; mantener reflejado el límite posterior a crear Stripe. Si el contrato v2
  falla tras publicar, conservar el rechazo temporal UE y resolver/revertir mediante
  PR aprobado; no convertir un error en permiso de compra silencioso.

## Actualizacion de implementacion (2026-10-11)

Tareas 1-4 completadas en cuatro commits locales. Tarea 5: 477 tests, lint,
TypeScript y build verdes; matriz real de seis destinos y cinco estados visuales
en movil/escritorio verificados. Revision independiente aprobada sin hallazgos
criticos/importantes/menores y 13 comprobaciones adicionales correctas. Auditoria
sin PR abiertos ni otras ramas pendientes. Integracion/deployment aun pendientes.
Correccion de contrato: el proveedor exige `front_dtf` + `dtfilm`; `front` +
`dtfilm` fue rechazado con HTTP400. El adaptador utiliza la configuracion real,
no un fallback DTG. No se han creado pedidos, pagos, PRs ni deployments.

## Handoff historico de la entrega del plan

Plan y diseño solamente. No se han ejecutado las tareas ni creado cotizaciones,
pedidos, commits, PRs o deployments en esta tarea de planificación. Los dos agentes
consultaron backend y UI en lectura con contextos separados; el coordinador verificó
el contrato público v2 y realizó la autorrevisión del plan contra su diseño.

Antes de ejecutar, refrescar main y confirmar que las firmas y componentes siguen
vigentes. Este plan define la política para datos desconocidos y métodos mixtos;
revisar esas decisiones junto con el límite postpago al aprobar la implementación.
