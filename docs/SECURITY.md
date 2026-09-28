# Seguridad

## Principios

- Los secretos nunca deben vivir en git.
- Los endpoints publicos deben rechazar entradas invalidas antes de trabajo costoso.
- Los webhooks deben autenticar antes de procesar.
- Los pagos y pedidos deben ser idempotentes.
- Cualquier cambio de seguridad necesita pruebas y verificacion completa.

## Secretos sensibles

Variables especialmente sensibles:

- `ADMIN_SECRET`
- `CRON_SECRET`
- `PRINTFUL_API_TOKEN`
- `PRINTFUL_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `FIREBASE_PRIVATE_KEY`
- `RESEND_API_KEY`

Si alguno se pego en chats, capturas, logs o pruebas compartidas, hay que rotarlo.

## Autenticacion admin y cron

Endpoints admin:

- `/api/catalog/sync`
- `/api/admin/orders`
- `/api/admin/orders/[orderId]/retry-printful`
- `/api/admin/printful/webhook`

Autenticacion:

- Admin: `x-admin-secret` o `Authorization: Bearer ADMIN_SECRET`.
- Cron: `Authorization: Bearer CRON_SECRET`.

Limitacion: esto es suficiente para una fase inicial, pero no sustituye un sistema de usuarios/roles si el panel admin crece.

## Webhooks

Stripe:

- `/api/webhooks/stripe`
- Requiere firma `stripe-signature`.
- Usa `STRIPE_WEBHOOK_SECRET`.
- Registra eventos para evitar duplicados.

Printful:

- `/api/webhooks/printful`
- Requiere `PRINTFUL_WEBHOOK_SECRET` por query param o header.
- Rechaza el evento antes de procesar si el secreto no coincide.
- Verifica `PRINTFUL_STORE_ID` si esta configurado.
- Registra eventos para evitar duplicados.

Riesgo operativo: si el secreto de Printful va en query param, los logs de infraestructura deben evitar exponer query strings completas.

## Endpoints publicos

Endpoints publicos principales:

- `/api/shipping/rates`
- `/api/checkout`

Controles actuales:

- Rate limit en memoria.
- Fallback global mas amplio cuando no hay identidad fiable de cliente.
- Headers proxy no confiados por defecto.
- Limite de cuerpo JSON de 64 KiB.
- Validacion estricta de campos.
- Serializacion de carrito en frontend para no aceptar campos visuales en APIs publicas.
- Recalculo de shipping y totales en servidor antes de crear checkout; no confiar en precios enviados por cliente.

Limitacion: el rate limit no es distribuido. En produccion con multiples instancias, se recomienda usar Redis, Upstash, Vercel KV u otro backend compartido.

## Dependencias

Estado verificado localmente y en el preview del PR #18 el 2026-09-28:

- Firebase Admin actualizado de `12.7.0` a `14.5.0` (version resuelta en el lockfile; rango declarado `^14.5.0`).
- Node.js `22.12.0` o posterior es obligatorio (`engines.node: >=22.12.0`) para desarrollo, builds y servidor. La verificacion local usa Node.js `24.15.0` y el proyecto de Vercel está configurado con Node.js `24.x`.
- Tests, lint, TypeScript y build local pasan. El preview `b404522` quedó `Ready`, leyó el catálogo real y renderizó `/`, `/products` y un PDP sin errores de inicialización de Firebase.
- Los smoke tests sin credenciales devolvieron `401` en `/api/admin/orders`, `/api/catalog/sync` y `/api/webhooks/printful`; un checkout con payload vacío devolvió `400`. No se usaron credenciales válidas ni se crearon pedidos, sesiones de Stripe o escrituras de prueba.
- `npm audit --omit=dev` baja de **13 hallazgos (10 moderate, 3 high)** antes de la migracion a **7 (4 moderate, 3 high)**. El comando sigue terminando con codigo 1; la auditoria no esta limpia. Los recuentos corresponden a paquetes afectados, no al numero de advisories individuales.
- Las antiguas rutas vulnerables de Firestore/Google GAX/retry-request/teeny-request dejan de aparecer en la auditoria. Firebase Admin y esos paquetes ya no figuran como hallazgos; queda la siguiente ruta de Firebase Storage.

### Residual de Firebase Storage

El arbol instalado conserva esta dependencia opcional de Firebase Admin:

```text
firebase-admin@14.5.0
  @google-cloud/storage@8.2.0 (optional)
    gaxios@6.7.1
      uuid@9.0.1
```

`uuid` y su dependiente `gaxios` siguen siendo hallazgos `moderate` por
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
La aplicacion actual no importa Firebase Storage; el `gaxios` instalado llama a
`uuid.v4()` sin buffer externo, mientras que el advisory afecta a `v3`/`v5`/`v6`
cuando se proporciona un buffer. Esta revision del uso actual no elimina el
hallazgo de la auditoria ni garantiza todos los usos futuros de la dependencia.

La persona propietaria acepta documentar este residual para crear el PR de la
migracion. Esa aceptacion se limita a esta ruta y a la creacion del PR; no supone
aprobar los otros hallazgos, un merge o un despliegue. Revisar esta evaluacion si
se incorpora Firebase Storage o cambia el uso de UUID.

### Todos los hallazgos productivos restantes

Severidades tomadas de `npm audit --omit=dev --json`:

| Paquete instalado | Severidad | Ruta o motivo |
| --- | --- | --- |
| `nanoid@3.3.16` | high | Next -> PostCSS -> Nano ID; generadores personalizados con tamano cero |
| `postcss@8.4.31` | high | Next -> PostCSS; advisories de XSS y lectura de mapas de fuente |
| `next@15.5.26` | moderate | Dependencia vulnerable de PostCSS |
| `sharp@0.34.5` | high | Next -> Sharp; advisories de libvips/libheif |
| `qs@6.15.3` | moderate | Stripe `17.7.0` -> qs; bypass de limites y denegacion de servicio |
| `gaxios@6.7.1` | moderate | Firebase Storage -> gaxios -> UUID |
| `uuid@9.0.1` | moderate | Ruta residual de Firebase Storage indicada arriba |

Los hallazgos de `nanoid`, `postcss`, `next`, `sharp` y `qs` permanecen sin cambios
y pendientes de remediacion en tareas separadas. La auditoria propone Next
`16.3.6`, un upgrade mayor, para PostCSS/Next; otros hallazgos indican fixes sin
upgrade mayor. No se aplicaron overrides ni `npm audit fix`. No usar `--force`
sin plan de compatibilidad y aprobacion explicita.

## Checklist antes de produccion

- Rotar secretos fuertes.
- Configurar dominio final y `NEXT_PUBLIC_BASE_URL`.
- Confirmar webhooks de Stripe y Printful contra dominio final.
- Verificar que Resend usa dominio validado.
- Confirmar que productos `isIgnored` no aparecen en catalogo publico ni checkout.
- Confirmar que la moneda activa viene de Printful y coincide en Firestore, Stripe y emails.
- Confirmar que las reglas de envio incluido siguen siendo intencionales antes de Stripe live.
- Mantener `ORDER_CONFIRM_PRINTFUL=false` hasta la compra real controlada.
- Mantener Stripe en test hasta cerrar textos, legales, secretos y fiscalidad.
- Validar fiscalidad antes de activar Stripe Tax.
