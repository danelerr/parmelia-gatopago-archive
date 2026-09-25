# Consumer → Next.js: estado verificable

Fecha: 20 de septiembre de 2026. Rama de trabajo: `feature/v3`.
Este documento describe cambios locales sin publicar ni desplegar.

## Resultado y límite

`apps/web` contiene un único frontend Next.js para landing, Consumer/PWA y
rutas públicas. Usa Tailwind 4 mediante PostCSS. Los comandos raíz `dev:client`,
`build:client` y `build` apuntan ahora a Web. Next no importa el entrypoint
Vite, React Router ni el transporte monetario V2.

**No se declara paridad funcional completa con `client`.** Tener las rutas y
formularios en Next no equivale a completar cobros, swap, perfil, contactos,
recovery o checkout. Algunas pantallas son presentadores nuevos basados en la
estructura anterior, no un traslado íntegro de todos sus controles y estados.
Esta diferencia no se resuelve solamente configurando Firebase y un API URL.

Se conservaron los tokens, estilos consumer aislados de marketing, marco
responsive, marca, controles de monto, navegación inferior y estructura de
Ajustes. No se certifica paridad visual píxel a píxel. La conversión a Tailwind
convive con CSS específico de marca y animación; no es una reescritura completa
de todos los selectores como utilities.

## Inventario

| Superficie | Estado local | Falta para su operación completa |
|---|---|---|
| `/`, `/en`, términos y privacidad | Landing y documentos en Next; Tailwind integrado | Revisión legal V3; `/docs` no migrado |
| `/login` | Autenticación V3 existente conservada, sin fallback V2 | Configuración y validación de servicios; no se probó login real en este turno |
| `/app` | Marco, saldo observado, acciones y navegación; consulta V3 existente | Paridad completa del Home original, balance automático y aceptación autenticada |
| `/move` y `?flow=receive` | Menú interactivo y enlaces Next | Disponibilidad operacional de cada destino |
| `/settings` | Seguridad, perfil/contactos, idioma ES/EN, fondos de prueba | Preferencias/push remotos y validación con sesión |
| `/settings/security` | Reutiliza SecurityEnrollment V3; acceso explícito a recovery | Gates de WebAuthn y cuenta; ninguna ceremonia al montar la pantalla |
| `/send` | Componentes V3 existentes de cuenta, saldo, preparación y revisión; QR sólo prellena dirección compatible | Recorrido real enviar → confirmar → reconciliar → liberar reserva → comprobante |
| `/statement` | Consulta V3 existente por referencia | No equivale al historial completo/filtros/exportación del Statement anterior |
| `/scan` | Cámara, foto y entrada manual; revisión de destino | Prueba física cámara/iOS y permisos; imagen y cámara no se certificaron con QR real |
| `/charge` | Monto, monto abierto, referencia | Flow: emisión de link, QR, compartir/descargar y estados reales |
| `/receive` | Explicación, red y acceso a cobrar | Cuenta receptora V3 validada, dirección/QR/copiar, activación real |
| `/swap`, `/earn`, `/crosschain` | Formularios/control local de monto, selección y tabs | Cotizaciones, balances, permisos, ejecución y seguimiento V3 |
| `/profile`, `/contacts` | Campos de perfil/usuario, búsqueda y formulario de contacto | Lectura, guardado, borrado y resto de estados del producto; no se simula persistencia |
| `/onboarding`, `/test-funds` | Guía hacia seguridad y estado de faucet | Provisión/capacidad verificada, disponibilidad y solicitud real |
| `/settings/security/recovery` | Guía, límites y acceso independiente | Política verificada, step-up, reemplazo, espera, cancelación y paquete de salida |
| `/pay`, `/pay/[linkId]`, `/pay/status`, `/cc/[recipient]`, `/[username]` | Entradas públicas sin asumir que URL = pago o usuario verificado | Lectura y ciclo completos de checkout/Flow; actualmente estado no conectado |

Alias deterministas: `/security` → `/settings/security`, `/recover` →
`/settings/security/recovery`, `/deposit/binance` → `/receive`. Los enlaces
de volver usan destino explícito y reemplazo, no `history.back()` recursivo.
`/username` y `/@username` conservan una entrada pública; no prueban existencia
de ese usuario. Referencias y parámetros no se interpretan como evidencia económica.
`/__design/meli` era una herramienta de desarrollo, no se trasladó como ruta pública.

## Separación de presentación y servicios

- `src/consumer/routes.ts`: inventario tipado de 17 vistas consumer y alias.
- `ConsumerContent`: composición por pantalla; módulos pesados se cargan bajo demanda.
- `PaymentScreens` y `AccountScreens`: presentación; ninguna llamada a V2.
- `AuthScreen` conserva el runtime V3 de identidad. Si está deshabilitado, las
  pantallas vacías pueden recorrerse con aviso explícito, sin identidad de prueba.
  En modo Firebase configurado, las rutas privadas requieren sesión.
- No se muestran cero, dirección receptora, cotización o éxito como sustitutos
  de datos desconocidos. Acciones sin integración están deshabilitadas.
- El lector QR limita tamaños, descarta montos/calldata, rechaza otros orígenes,
  libera cámara al salir/ocultar, y exige revisión. Una red explícita distinta
  a la cuenta seleccionada impide prellenar el destinatario.
- El código añadido no usa WalletConnect, Reown ni `window.ethereum`.

## Validación de este turno

Todos los comandos siguientes se ejecutaron localmente el 20 de septiembre:

- `pnpm --filter @gatopago/web test`: **34 archivos, 927 pruebas, exit 0**.
  Incluye 48 pruebas nuevas de inventario, presentación indisponible y QR.
- `pnpm --filter @gatopago/web lint`: exit 0. Se retiraron únicamente dos
  identificadores sin uso de los archivos de comprobante preexistentes; se
  preservó el resto del trabajo previo de transferencia.
- `pnpm --filter @gatopago/web typecheck`: exit 0.
- `pnpm --filter @gatopago/web build`: exit 0, con guard de descriptor de fuentes.
  Último descriptor: `web-v3-542f119f2fb6a996dd539df99309f18c530feb80d9d6d2d874bf1251b7d2960e`, 232 entradas.
- Chromium/Playwright CLI, build optimizado local, viewport 390×844:
  se consultaron rutas consumer/públicas y alias; las 18 URLs del barrido
  principal respondieron 200 sin desbordamiento horizontal. Se verificaron
  además `/@daniel`, `/%40daniel`, `/daniel`, ES/EN, legales y una ruta
  multinivel inexistente (404). Esto no prueba identidad ni pagos.
- Interacción local en desarrollo: monto `12,50` normalizado, monto abierto,
  botón volver a recibir; QR ERC-681 manual convertido en revisión de dirección
  y red sin conservar el monto. No se envió ninguna operación.
- Capturas locales: `output/playwright/v3-consumer-home-mobile.png`,
  `v3-consumer-settings-mobile.png`, `v3-consumer-charge-mobile.png`.

El primer barrido encontró una tarjeta mal estructurada y un perfil `@` que
recibía un parámetro codificado; ambos se corrigieron. Hubo un 404 de chunk
jsQR en desarrollo que no se reprodujo en el build optimizado. Chromium con
service worker mostró avisos de preload no utilizado/cross-world mismatch;
no se presentan como errores de pago ni como rendimiento certificado.

## No cambiado y trabajo pendiente

No hubo commit, push, despliegue, migración D1, modificación de secretos/DNS,
configuración de Firebase/Workers, contratos, activación mainnet ni prueba con
fondos. No se certifican iPhone, Android, passkeys reales ni sesiones remotas.

`client/` permanece como referencia y miembro histórico del workspace. No se
eliminó código fuente anterior antes de demostrar paridad; retirar su runtime
y adaptar los gates globales V2 sigue pendiente. Los checks globales existentes
todavía mencionan `client`, `dashboard`, Vite y bundles antiguos: **este turno
no declara `verify:ci` ni `verify:all` verdes**. No se tocó la eliminación previa
del dashboard, ni se modificó el repositorio Astro de la landing.

Antes de decir “migración completa” hace falta: comparar y recuperar los
controles/estados restantes contra el inventario original, completar adapters
V3 por capacidad, verificar los recorridos con sesiones y respuestas reales,
y retirar el frontend/gates históricos de forma coherente. Configurar servicios
locales es una tarea distinta, expresamente pospuesta por el usuario.
