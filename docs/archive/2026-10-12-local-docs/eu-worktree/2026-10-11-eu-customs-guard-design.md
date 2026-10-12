# Control preventivo de aduanas para destinos UE

> **Documento historico conservado el 12 de octubre de 2026.** No es una
> instruccion de ejecucion ni evidencia de que sus casillas sigan pendientes.
> Consultar la checklist vigente y el indice de conservacion antes de reutilizarlo.
> [Checklist vigente](../../../LAUNCH_CHECKLIST.md).


Fecha: 2026-10-11. Estado: implementado y verificado localmente; pendiente de integracion/deployment.
Base inspeccionada: checkout local `fed72dc`. Este documento no certifica un
deployment. La evidencia nueva esta en la matriz de fulfillment del 2026-10-11.

Correccion verificada durante implementacion: v2 exige placement `front_dtf`
con tecnica `dtfilm`; la propuesta inicial `front` + `dtfilm` devuelve HTTP400.
Donde el diseno menciona esa correspondencia se aplica la configuracion real,
sin cambiar tecnica ni omitir placements para conseguir una respuesta.

## Objetivo y alcance acordado

Evitar iniciar un pago con una opción de envío que señale posibles cargos de
importación para España, Francia, Alemania, Italia o Portugal. Mantener las ventas
a Estados Unidos y el precio comercial actual: el envío Standard está integrado
en el precio del producto y aparece a `0.00` en checkout para los seis destinos.

La restricción depende de la dirección, los artículos y el método cotizado. No
convierte una prenda en indisponible globalmente ni utiliza una lista permanente
de colores/tallas basada en un snapshot antiguo.

## Hechos del código y contrato del proveedor

- `getShippingRates()` usa `POST /shipping/rates` v1 para tarifas; `quoteShipping()`
  y `createCheckout()` lo llaman por separado. El segundo vuelve a cargar los
  productos desde Firestore antes de crear el pedido y la sesión de Stripe.
- La señal documentada de aduanas pertenece a v2:
  `data[].shipments[].customs_fees_possible`. Es por paquete previsto, dentro de
  cada método; no es un booleano en la raíz de la tarifa v1.
- El endpoint v2 recibe variantes de catálogo, cantidades y configuración de
  impresión. Debe representar los productos sincronizados reales. La técnica no
  se deduce de un título comercial ni se sustituye por DTG por defecto.
- La UI activa de compra es `product-purchase-panel.tsx`. `storefront.tsx` conserva
  un flujo antiguo que hoy no está montado por las páginas. La API admite pedidos
  multilínea aunque el PDP actual añada una sola variante.

Referencia técnica consultada: [Printful v2, Shipping Rates y Shipment information](https://developers.printful.com/docs/v2-preview/#tag/Shipping-Rates-v2).
La documentación identifica v2 como beta. El adaptador tendrá pruebas de contrato
y tratará respuestas inesperadas como una comprobación no disponible.

## Política propuesta, cerrada para este plan

| Entrada | Resultado |
| --- | --- |
| País `US` | Flujo actual; no depende de la comprobación v2 UE |
| País `ES`, `FR`, `DE`, `IT` o `PT`; todos los paquetes del método tienen `false` y cubren exactamente el carrito | Método elegible |
| Mismo destino; algún paquete del método tiene `true`, con respuesta completa y válida | Método rechazado por posible importación |
| Señal ausente, `null`, de tipo incorrecto, paquetes vacíos, cobertura incompleta, método sin correspondencia o respuesta contradictoria | Método no verificable; no autoriza pago |
| Error de red, timeout, 429 o respuesta v2 ilegible | No se inicia pago UE; se puede volver a calcular |
| Coexisten métodos elegibles y rechazados/no verificables | Ofrecer solo los elegibles; no cambiar automáticamente el método elegido al crear Stripe |
| Ningún método elegible, todos los métodos v1 tienen riesgo confirmado | HTTP 409, `EU_CUSTOMS_RISK` |
| Ningún método elegible y alguno no puede comprobarse | HTTP 503, `SHIPPING_CHECK_UNAVAILABLE` |
| No quedan métodos v1 o desaparece el ID seleccionado al crear checkout | HTTP 409, `SHIPPING_OPTIONS_CHANGED` |
| País no permitido, incluidos `CA` y `GB` | Rechazo actual anterior a las llamadas al proveedor |

No verificable no significa que se haya confirmado un cargo. Su mensaje será
distinto del bloqueo por riesgo. Esta decisión conservadora forma parte del diseño
propuesto para evitar cobrar cuando la comprobación no se ha podido completar.

Se evaluará el carrito completo, incluyendo paquetes divididos. Un método solo
es elegible si la suma de cantidades por `catalog_variant_id` coincide exactamente
con las líneas solicitadas, sin artículos adicionales. No eliminar artículos ni
crear un checkout parcial. `departure_country=null` no invalida por sí solo una
respuesta completa con señal explícita; no inferir riesgo por el país de salida.

## Arquitectura elegida

Conservar v1 para importes, monedas y métodos actuales. Para destinos UE, obtener
además una cotización v2 del mismo carrito/dirección y cruzar por ID de método y
moneda. Utilizar v2 únicamente para la elegibilidad aduanera. Aplicar después la
regla existente de precio Standard incluido. No sumar otra vez el coste del
transporte ni sustituir tarifas del cliente con importes v2.

Resolver la técnica/placements con lecturas del producto sincronizado en Printful,
deduplicadas por producto durante la petición. Admitir inicialmente únicamente
la configuración que se verifique con las prendas actuales; el contrato mínimo
previsto es `front_dtf` -> `front` + `dtfilm`, pendiente de comprobar con fixtures
reales al ejecutar la tarea 1. Cualquier otra configuración se declara no verificable
hasta ampliar el adaptador con evidencia. No cambiar el modelo del catálogo ni
guardar datos de clientes en fixtures. No asumir que todas las prendas futuras
usan esa configuración.

La comprobación se realiza al pedir opciones y de nuevo al crear checkout, antes
de escribir un pedido o llamar a Stripe. No aceptar booleanos, tarifas o decisiones
de elegibilidad enviados por el navegador.

## Experiencia del cliente y texto público

- Mantener dirección, producto y variante tras el rechazo, y permitir corregirlos.
- Invalidar la cotización ante cambios; ignorar respuestas tardías de consultas
  anteriores. Durante la creación de Stripe, deshabilitar las ediciones de la compra.
- Comunicar el bloqueo con `role="alert"`, antes del pago, en inglés y sin nombrar
  Printful. No afirmar que el producto sale necesariamente de EE. UU.
- Texto de riesgo: “This selection is currently unavailable for delivery to your
  address because import charges may apply. Try a different size, color or product,
  then check shipping again.”
- Texto de comprobación fallida: “We couldn't verify delivery availability for this
  selection. Please check shipping again in a moment.”
- Texto de opciones cambiadas: “Shipping options have changed. Please check shipping
  again before paying.”
- Política pública: “Standard shipping is included for eligible orders to the US,
  Spain, France, Germany, Italy, and Portugal. Delivery availability depends on your
  selected items and address and is checked before payment. Some orders may be
  fulfilled outside your country. Options flagged for possible import charges to
  our EU destinations are currently unavailable.”

No publicar la promesa previa de que siempre conoceremos y anunciaremos cualquier
impuesto antes del pago: la nueva comprobación se limita a la señal que devuelve
la cotización, no fija la ruta definitiva.

## Límites explícitos

- Sin cambios de precios, países, Stripe Tax, claves, confirmación de fabricación,
  reembolsos, catálogo, checkout alojado de Stripe ni webhooks.
- Sin nuevas pantallas de carrito, geolocalización, selección regional en catálogo
  ni listas manuales de variantes bloqueadas.
- La decisión se renueva hasta la creación de Stripe. No se introduce en esta fase
  una tercera consulta tras cobrar ni una nueva máquina de estados de fulfillment.
  Printful aún puede cambiar la ruta después; no prometer ausencia garantizada de
  cargos. Si se detecta ese cambio, se aplica revisión operativa antes de confirmar
  fabricación cuando todavía sea posible detenerla.
- No usar `fulfillmentBlocked` para aduanas: actualmente pertenece al control de
  reembolsos. No cambiar el hash de validación de pedidos históricos.
- Mantener las plantillas legales como borradores y la checklist en su estado real.
  Este cambio no constituye aprobación de lanzamiento ni configura DDP.

## Criterios de aceptación

Una compra UE con riesgo o sin evidencia suficiente no escribe un pedido ni crea
Stripe; US conserva su comportamiento. Cambiar talla, dirección o carrito obliga
a cotizar de nuevo, y una respuesta antigua no vuelve a habilitar el pago. Un
método apto conserva su precio actual. La prueba de contrato reproduce la técnica
real de las prendas. Tests, lint, TypeScript, build y verificación móvil/escritorio
demuestran esos comportamientos antes de preparar la integración.
