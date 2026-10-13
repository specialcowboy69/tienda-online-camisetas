# GA4 con consentimiento previo — diseño

Fecha: 13 de octubre de 2026.
Estado: especificación aprobada por el propietario el 13 de octubre de 2026.
No implementado, no publicado y sin datos enviados a Google.
Plan asociado: [implementación de GA4](../plans/2026-10-13-ga4-consent.md),
pendiente de revisión y elección del método de ejecución.

## 1. Objetivo y alcance aprobado

Conocer las visitas y la navegación del storefront de No Context Club usando
el identificador proporcionado por el propietario, `G-4JDZCBK8SY`. Es un
identificador público, no una contraseña. Medir únicamente después de que el
visitante acepte analítica; rechazar no debe impedir navegar ni comprar.

La propuesta aprobada incluye banner propio en inglés, aceptar/rechazar con
igual accesibilidad, preferencias persistentes, enlace permanente para cambiar
la elección, visitas sin duplicados, exclusión de datos personales y pruebas.
Google Ads permanece desactivado. No incluye conversiones de compra.

Este es un subsistema nuevo: el código revisado no contiene GA4, GTM ni un
gestor de consentimiento. Se sigue la ruta arquitectónica de `brainstorming`:
diseño escrito, revisión del propietario, plan de implementación y ejecución.
Tras revisar este documento, el propietario respondió «sí» a su aprobación.
Esa aprobación permite elaborar el plan; no acredita implementación ni activación.

## 2. Contexto comprobado y alternativas

- `src/app/layout.tsx` renderiza el contenido y estilos, sin etiquetas de
  medición. Next.js usa App Router; no basta medir únicamente cargas completas.
- Home, catálogo y PDP tienen componentes distintos, sin footer global de
  preferencias. El formulario comercial usa estado React y no debe perderse
  por cambiar el consentimiento.
- `npm.cmd test` enumera explícitamente sus archivos: habrá que incluir las
  pruebas nuevas, no asumir su descubrimiento automático.
- Los borradores de privacidad/cookies consultados pertenecen al trabajo legal
  separado. La integración no publicará plantillas incompletas ni inventará
  identidad, retención contractual o datos del negocio.

Alternativas consideradas:

1. **Banner propio para una categoría opcional (elegido):** sin dependencia
   comercial nueva; obliga a probar persistencia, revocación y red.
2. **CMP externa:** útil con más proveedores o categorías; introduce coste,
   configuración y otra dependencia que este alcance no necesita.
3. **Etiqueta incondicional o modo avanzado:** descartado porque no cumple el
   requisito acordado de bloquear la medición antes de aceptar.

## 3. Experiencia del visitante

Banner compacto con estética existente (crema, negro y azul), texto legible,
foco visible y sin bloquear la compra. Texto inicial propuesto:

> We use optional Google Analytics cookies to understand visits to our store.
> Analytics stays off unless you accept. You can change your choice at any time
> using Cookie settings. Advertising tracking is off.

Acciones: **Accept analytics**, **Reject analytics**, **Settings**. Aceptar y
rechazar tendrán el mismo tamaño y prominencia. Cerrar ajustes, pulsar Escape,
desplazarse o comprar nunca equivalen a aceptar.

En ajustes: información de almacenamiento necesario para guardar la elección,
interruptor de analítica apagado inicialmente, publicidad informada como
desactivada (sin interruptor que aparente activarla), y **Save preferences**.
El panel se implementará como diálogo accesible: nombre, foco inicial, recorrido
de teclado, Escape y restitución del foco al control que lo abrió.

Un botón permanente **Cookie settings** al pie permite reabrir el panel. No
se enlazará a rutas legales inexistentes: los enlaces definitivos serán una
condición para la activación pública, no placeholders visibles.

## 4. Arquitectura y responsabilidades

| Unidad propuesta | Responsabilidad y límite |
| --- | --- |
| `src/lib/analytics-consent.ts` | Validar preferencia/versiones/caducidad y decidir permiso; funciones puras sin acceso a pedidos |
| `src/lib/google-analytics.ts` | Único propietario de carga/configuración, pausa y eventos; no importar servicios de servidor |
| `src/components/analytics-consent.tsx` | Banner, ajustes, almacenamiento y coordinación con navegación |
| `src/app/layout.tsx` | Un único punto de montaje; conservar contenido y metadatos actuales |
| `src/app/globals.css` | Estilos acotados; no rediseñar home, catálogo ni PDP |
| `docs/analytics-and-consent.md` | Contrato operativo, activación y evidencias cuando se implemente |

No añadir SDK, GTM, API de medición, colección Firestore ni servidor de eventos.
Mantener pedidos, Stripe, envíos, proveedor, emails y alertas sin cambios.

## 5. Preferencias y estados

Registro propio en localStorage bajo `ncc.analytics-consent.v1`, únicamente
versión, elección `granted`/`denied` y fecha de elección. Caducidad propuesta:
180 días desde esa elección, igual para aceptar y rechazar, sin renovación por
visitar. No guardar un identificador de persona ni un historial de navegación.

| Estado | Comportamiento requerido |
| --- | --- |
| Sin elección / corrupta / versión distinta / caducada | Analítica bloqueada; mostrar banner |
| Rechazada vigente | Sin etiqueta ni medición; mantener acceso a ajustes |
| Aceptada vigente y entorno/ruta habilitados | Permitir carga única y medición mínima |
| Almacenamiento bloqueado | No romper la tienda; elección solo en memoria hasta salir; explicarlo en ajustes |
| Retirada | Bloquear inmediatamente nuevos eventos, cancelar carga pendiente y limpiar cookies de esta integración |

Sincronizar cambios entre pestañas mediante el evento de almacenamiento y
revalidar al recuperar el foco. Comprobar caducidad también antes de enviar.
Ante fallos de lectura o valores inválidos, denegar por defecto.

La retirada no recargará automáticamente la página: se conservarán carrito y
formulario. El adaptador tendrá una guardia síncrona, deshabilitará la medición
del ID y descartará eventos en cola. No confiar en quitar el elemento script:
eso no descarga código ya ejecutado. La prueba con la etiqueta real deberá
acreditar ausencia de nuevos envíos tras retirar; una petición ya iniciada
antes de retirar no puede recuperarse. Si no se logra, no activar esta versión.

## 6. Consentimiento y carga de Google

Aplicar **Consent Mode básico**: sin petición de gtag.js, preconexión, ping o
medición a Google antes de aceptar o tras rechazar. Configurar valores iniciales
denegados antes de cualquier inicialización; al aceptar, solo
`analytics_storage` puede pasar a `granted`. `ad_storage`, `ad_user_data` y
`ad_personalization` permanecen `denied`.

Conservar una sola instancia por documento y controlar carreras: doble clic,
efectos React repetidos, cambio de ruta durante carga y retirada antes de que
termine gtag.js. El error de carga no bloquea compra ni provoca reintentos
ilimitados. No acumular visitas anteriores al consentimiento para enviarlas
después.

Configurar sin personalización publicitaria ni Google Signals. No modificar
vinculaciones de cuentas ni activar destinos adicionales. En la revisión remota
deberá comprobarse que la etiqueta no tenga destinos publicitarios adicionales.

Referencia: [Google, modo básico y avanzado](https://developers.google.com/tag-platform/security/concepts/consent-mode).

## 7. Qué se mide y qué no

Allowlist inicial: `/`, `/products` y PDP existentes con slug público validado.
Un pathname desconocido no se envía; no inferir que cualquier valor después de
`/products/` es un producto. Excluir administración, APIs, éxito, cancelación y
cualquier futura ruta no incorporada expresamente.

Los formularios de compra comparten página con el producto; no leer campos,
eventos de formulario, clics ni carrito. La lista de rutas por sí sola no los
protege de medición automática: esta debe permanecer desactivada en GA4.

| Evento de la aplicación | Momento | Datos permitidos |
| --- | --- | --- |
| `page_view` | Una vez por carga inicial con permiso vigente (o al aceptar por primera vez) en página permitida y una vez por transición real a otra página permitida | URL canónica sin query/hash; título fijo por tipo de página; referente sanitizado |

No reenviar al renderizar ni por cambiar solo query/hash. Volver de B a A sí
constituye otra visita. Guardar de nuevo una aceptación ya vigente no añade
visita. Tras retirar y aceptar de nuevo, empieza un nuevo período permitido
con una única visita de la página actual. Desactivar `send_page_view` automático y comprobar en
la propiedad que Enhanced Measurement no añade eventos de historial, búsqueda,
formularios, scroll, vídeo, descargas o clics. Google advierte que desactivar
`send_page_view` en código no basta para frenar visitas por historial.
[Referencia oficial](https://developers.google.com/analytics/devguides/collection/ga4/views).

Usar origen canónico y rutas conocidas, sin copiar `location.href`, texto libre
o `document.title` arbitrario. Para referente externo, solo origen HTTP(S);
para interno, solo ruta permitida; en los demás casos, vacío. Nunca email,
nombre, teléfono, dirección, ID de pedido/pago, secretos o parámetros de URL.
No UTM ni identificadores de anuncios en esta primera versión: se renuncia a
esa atribución hasta diseñarla explícitamente.

GA4 puede generar eventos técnicos de sesión/engagement propios; no prometer
que el único tráfico del proveedor sea el evento manual. La prueba de red debe
incluirlos y comprobar que tampoco filtran rutas excluidas o parámetros. Pausar
la medición al entrar en una ruta excluida, no solo omitir nuestro page_view.

No `purchase`, `refund`, enhanced conversions, remarketing, User-ID o medición
de Checkout. Visitar `/success` no demuestra por sí mismo una compra.

## 8. Configuración y activación separadas

Variables públicas propuestas: `NEXT_PUBLIC_GA4_ID` y
`NEXT_PUBLIC_ANALYTICS_ENABLED`, con valor habilitante exactamente `true`.
Ausencia, ID inválido o configuración no habilitada mantienen la etiqueta
apagada; no ofrecer aceptación de un servicio que no está habilitado.

La entrega de código quedará apagada por defecto. Para Production se permitirá
solo el origen canónico; Preview y localhost no enviarán datos al flujo real.
Las pruebas locales habilitarán el comportamiento con interceptación de red.

Antes de activar con un despliegue independiente se requiere:

- Publicar información de privacidad/cookies revisada y enlazarla en ajustes;
  la marca no sustituye los datos obligatorios pendientes del responsable.
- Comprobar en la propiedad GA4 el flujo correcto, destinos de etiqueta,
  Enhanced Measurement y configuración de privacidad/retención. No atribuir
  una configuración al proveedor sin leerla ni modificarla sin autorización.
- Configurar una duración explícita de cookies de analítica de 180 días, sin
  renovación por visita, y un prefijo propio para poder eliminarlas sin tocar
  cookies de pago, seguridad u otras aplicaciones. Son valores de diseño, no
  un inventario observado. Inventariar nombres/dominios efectivos en navegador.
- Superar las pruebas siguientes y autorizar la activación/remota de manera
  separada. Un PR, un script cargado o un 204 no prueban recepción en GA4.

La [referencia de configuración de GA4](https://developers.google.com/analytics/devguides/collection/ga4/reference/config)
documenta campos de cookies, páginas y opciones publicitarias. La duración
elegida para cookies no configura ni acredita retención del lado de Google.

## 9. Criterios de aceptación y verificación

1. Pruebas RED/GREEN de validación, caducidad, ausencia de permiso y rutas/datos
   permitidos; incluir todos los archivos nuevos en `npm.cmd test`.
2. Primera visita y rechazo: cero peticiones a Google y ninguna cookie GA.
3. Aceptación: una sola carga y un page_view de la página actual; navegación,
   atrás/adelante y renders sin duplicados ni reproducción de visitas previas.
4. Retirada antes/después de cargar, doble clic, pestañas, preferencia caducada
   y fallo de almacenamiento: bloquear medición sin perder carrito ni formulario.
5. URLs con datos sintéticos sensibles: no aparecen en eventos ni referentes;
   rutas excluidas y formularios no se miden, incluso tras navegar desde home.
6. Banner y ajustes a 390x844 y 1440x900: teclado, foco, contraste, texto inglés,
   aceptar/rechazar equivalentes y enlace permanente funcional.
7. Tests completos, lint, TypeScript y build. No llamar verde a un comando
   fallido por auxiliares locales ignorados; registrar por separado ese caso.
8. Revisar integración de ramas/PRs según AGENTS antes de publicar o integrar;
   no mezclar cambios legales ajenos sin autorización.

Pruebas iniciales con respuestas interceptadas, sin contaminar Analytics ni
tocar Stripe, Firestore, fabricación o email. Distinguir claramente validación
de código/interceptación de la comprobación final con gtag.js real y recepción
en Realtime/DebugView. Si falta acceso al panel, dejar esa evidencia pendiente.

## 10. Entrega, límites y estado del trabajo

Documentar en `docs/analytics-and-consent.md`, checklist y runbook el estado
implementado/configurado/activado/verificado por separado. Adaptar los borradores
legales cuando estén integrados, sin publicar suposiciones. No borrar su historia.

Trabajar en `codex/ga4-consent` desde `origin/main`. La especificación es
independiente del código del PR legal; los textos públicos revisados sí son
prerrequisito de la activación. No hacer merge, despliegue ni cambios en las
cuentas como consecuencia de aprobar este documento. NO-GO y Stripe Tax siguen
igual; no altera el estado de los otros pendientes de lanzamiento.

Checklist de esta fase:

- [x] Revisar implementación, documentación y alcance con el propietario.
- [x] Comparar enfoques y recibir aprobación del alcance conversacional.
- [x] Escribir especificación y revisar coherencia, límites y aceptación.
- [x] Revisión y aprobación del propietario de esta especificación (13 de octubre).
- [ ] Elaborar y revisar el plan de implementación; elegir su ejecución.
- [ ] Implementar, probar y entregar el cambio según el plan aprobado.
