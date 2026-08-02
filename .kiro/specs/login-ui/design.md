# Diseño técnico — `login-ui`

## Overview

`login-ui` sustituirá la pantalla inicial de plantilla en `/` por una interfaz de inicio de sesión en navegador que consume el Route Handler existente `POST /api/v1/auth/login`. La entrega es exclusivamente de interfaz: no modifica el handler, `loginSchema`, `auth.service`, la base de datos ni `proxy.ts`.

La página representa el acceso a una operación de formularios QR: una credencial clara, sobria y verificable. Reutilizará los tokens semánticos actuales, `DM Sans` para lectura y `Merriweather` para el título. Como firma visual acotada, una franja breve de tres módulos inspirados en un patrón QR acompañará el encabezado solo como decoración (`aria-hidden`); no comunica estado ni reemplaza texto.

### Decisiones y límites

- `/` será el único host de esta entrega porque `app/page.tsx` es hoy la pantalla inicial; no se crea ni se presupone una ruta `/login`.
- Un `200` crea estado efímero en memoria de la interfaz. No se persiste nada en cookies, `localStorage`, `sessionStorage`, URL, logs ni contenido renderizado.
- No hay redirección ni activación de pantallas protegidas. Si `passwordChangeRequired` es `true`, el resultado queda restringido y solo se informa el requisito de cambio.
- Quedan fuera de alcance registro, recuperación o cambio de contraseña, refresh, logout, restauración tras recarga, navegación autenticada, autorización y cambios de backend.

## Architecture

```mermaid
flowchart LR
  P[app/page.tsx\nServer Component] --> F[LoginForm\nClient Component]
  F --> V[login-ui.ts\nvalidación y normalización puras]
  F -->|POST JSON| A[/api/v1/auth/login\nRoute Handler existente]
  A -->|200, 401 o 422| F
  F --> M[Estado efímero y Alert accesible]
```

`app/page.tsx` permanece como Server Component y solo compone estructura estática, encabezado y `LoginForm`. `LoginForm` será el único entry point con `'use client'`, pues concentra eventos, `useState` y `fetch`; no recibe funciones ni datos sensibles desde el servidor. Esta separación sigue la guía local de Next.js para `use client` y evita ampliar innecesariamente el bundle cliente.

La implementación usará `fetch` nativo dentro del submit, en lugar de Server Actions o una librería de caché: el endpoint REST ya existe, la operación es puntual y no hay dependencias de consulta instaladas. El `POST` no se cachea conforme a la guía local de Route Handlers.

### Flujo de datos

1. El evento nativo `onSubmit` obtiene `cedula` y `password`, ejecuta los validadores puros y detiene el flujo si hay errores; no hay solicitud de red.
2. Con datos válidos, `LoginForm` establece pendiente y llama a `fetch('/api/v1/auth/login')` con `method: 'POST'`, `Content-Type: application/json` y el único body permitido `{ cedula, password }`.
3. La respuesta cruza de la frontera de red como `unknown`. Un guard acepta `200` solo cuando están presentes y son válidos `accessToken`, `refreshToken`, `user` y `passwordChangeRequired`.
4. Un `200` normal crea `SessionState` efímero disponible; un `200` con `passwordChangeRequired: true` conserva el resultado solo como estado restringido, sin exponerlo ni habilitar flujos. `401`, `422` y fallos seguros limpian contraseña según corresponda, no crean sesión disponible y actualizan errores o `StatusMessage`.
5. Al terminar toda rama, se quita el estado pendiente. Ni los tokens ni la contraseña se serializan a un Server Component, se incluyen en URL ni se escriben en almacenamiento del navegador.

## Components and Interfaces

| Archivo | Responsabilidad y límite |
| --- | --- |
| `app/page.tsx` | Host de servidor de `/`; presenta la estructura de la pantalla y monta `LoginForm`. |
| `components/auth/login-form.tsx` | Client Component; controla entradas, submit único, estado pendiente, mensajes, limpieza de contraseña y estado efímero de sesión. Nunca renderiza tokens ni los propaga. |
| `lib/auth/login-ui.ts` | Módulo puro, sin React ni E/S; valida campos, traduce problemas `422`, verifica la forma del `200` y deriva la disponibilidad restringida o disponible de sesión. |
| `components/ui/input.tsx`, `components/ui/label.tsx`, `components/ui/alert.tsx` | Primitivas que se generarán con la configuración shadcn/ui existente. `Button` ya existe y se reutiliza. |
| `app/layout.tsx` | Ajusta metadata y `lang` a español para la pantalla; no crea una capa de autenticación. |

El formulario usa `<form onSubmit>` y un `Button type="submit"`; por eso Enter, el botón y cualquier activación de teclado comparten exactamente una ruta de validación y solicitud. `Label` enlaza con `Input` mediante `htmlFor`/`id`; la contraseña usa `type="password"`, `autoComplete="current-password"` y nunca se refleja en mensajes.

## Data Models

`lib/auth/login-ui.ts` definirá constantes de runtime para campos y estados, de las que derivará los tipos TypeScript; no empleará `any` ni uniones literales duplicadas. Las interfaces serán planas y el payload externo entrará como `unknown` hasta superar guards de tipo.

- `LoginCredentials`: `cedula` y `password`, usados solo para validar y construir el body exacto `{ cedula, password }`.
- `FieldErrors`: mapa parcial por `cedula` y `password`; almacena únicamente mensajes localizados, no valores.
- `LoginSuccessPayload`: `accessToken`, `refreshToken`, `user` y `passwordChangeRequired`, validado antes de crear estado.
- `SessionState`: los cuatro valores exitosos y una disponibilidad derivada. Solo una disponibilidad normal expone una sesión a flujos futuros; la disponibilidad restringida permanece inaccesible.
- `StatusMessage`: texto localizado y tono para el `Alert`, independiente de los errores de campo.


## Correctness Properties

*Una propiedad es una característica que debe mantenerse en todas las ejecuciones válidas. Conecta los requisitos legibles con garantías automatizables; aquí se limita a validación, normalización y transiciones puras, no a la apariencia de la interfaz.*

### Reflexión y consolidación de propiedades

La presentación, semántica DOM, foco y adaptación son comprobaciones de componente o navegador, no propiedades de renderizado. Se fusionan los criterios 2.1 y 2.4 porque la misma regla de validación determina la imposibilidad de enviar; los criterios 4.3, 4.4 y 4.5 se expresan como una única propiedad de disponibilidad de sesión según el booleano; y 4.1 y 4.2 se consolidan como no exposición y limpieza en todos los resultados. Esta consolidación deja siete garantías independientes y evita repetir la misma invariante.

### Property 1: La validación local coincide con el contrato y bloquea el envío

Para toda cadena de Cédula, la validación la acepta si y solo si contiene de 6 a 15 dígitos ASCII; para todo estado que contenga al menos un Error_de_Campo, la decisión de enviar es falsa.

**Validates: Requirements 2.1, 2.4**

### Property 2: La corrección de un campo no modifica el otro

Para todo estado de formulario y toda edición de `cedula` o `password` cuando ese campo tiene error, reevaluar el campo editado preserva exactamente el valor y Error_de_Campo del otro campo.

**Validates: Requirements 2.3**

### Property 3: La solicitud de inicio de sesión es mínima y fiel

Para todas las Credenciales válidas, la solicitud construida usa `POST`, JSON y un body cuya única clave es `cedula` y `password`, con los mismos valores de entrada.

**Validates: Requirements 3.1**

### Property 4: Un éxito completo deriva una sesión disponible solo cuando corresponde

Para todo payload `200` con `accessToken`, `refreshToken`, `user` y `passwordChangeRequired` válidos, se conserva el resultado completo en el estado efímero; la sesión disponible existe si y solo si `passwordChangeRequired` es `false`, y cuando es `true` el estado permanece restringido y no habilita flujos autenticados.

**Validates: Requirements 3.3, 4.3, 4.4, 4.5**

### Property 5: Los problemas `422` se asocian únicamente a sus campos indicados

Para todo arreglo de problemas de validación con ruta inicial `cedula` o `password`, la transformación produce un Error_de_Campo localizado para cada campo señalado y no crea Estado_de_Sesión.

**Validates: Requirements 3.5**

### Property 6: Las respuestas desconocidas fallan de forma segura

Para todo estado HTTP distinto de `200`, `401` o `422`, y para todo body `200` que no cumpla la forma esperada, el resultado es reintentable, no crea Estado_de_Sesión y no incorpora datos del body al mensaje visible.

**Validates: Requirements 3.6**

### Property 7: Los secretos no se filtran y los fallos limpian la contraseña

Para todo par de tokens y credenciales, procesar un éxito, un `401` o un `422` nunca coloca `accessToken` ni `refreshToken` en contenido renderizado, URL, entradas o mensajes; después de `401` o `422`, `password` queda vacío, `cedula` se conserva y no hay sesión disponible.

**Validates: Requirements 4.1, 4.2**

## Error Handling

| Situación | Comportamiento de interfaz |
| --- | --- |
| Cédula localmente inválida | Muestra «Ingrese una cédula de 6 a 15 dígitos.» junto al campo; no llama a `fetch`. |
| Contraseña vacía | Muestra «La contraseña es obligatoria.» junto al campo; no llama a `fetch`. |
| Solicitud en curso | El formulario declara `aria-busy="true"`, el `Button` queda deshabilitado y muestra «Iniciando sesión…». Una segunda activación no inicia otra solicitud. |
| `401` | Limpia solo la contraseña, conserva Cédula, no crea sesión y muestra «No fue posible iniciar sesión. Verifique sus credenciales e inténtelo nuevamente.» sin atribuir el fallo a un campo. |
| `422` con rutas reconocibles | Limpia contraseña, conserva Cédula, asocia mensajes españoles a cada campo indicado y muestra «Revise los campos indicados.» como estado general. |
| `422` sin rutas reconocibles, red, JSON inválido, estado inesperado o `200` malformado | No revela detalle de servidor, limpia contraseña si la respuesta fue `422`, conserva Cédula, no crea sesión, habilita reintento y muestra «No fue posible iniciar sesión. Inténtelo nuevamente.» |
| `200` con `passwordChangeRequired: true` | Crea el estado restringido, mantiene los secretos solo en memoria del componente y muestra «Debe cambiar su contraseña antes de acceder a la aplicación.» No invoca cambio de contraseña ni navegación. |

El controlador leerá el body como `unknown`, capturará los fallos de parseo y aplicará guards antes de usarlo. Nunca mostrará `error`, `issues` no mapeados, `password`, tokens ni datos técnicos de red. Solo los errores de `cedula` y `password` resultan de un `422`; los demás detalles se descartan en favor del mensaje seguro.

## Accesibilidad, diseño visual y adaptación

El layout será mobile-first: `main` ocupará como mínimo `100svh`, tendrá padding fluido seguro y centrará un panel `w-full min-w-0 max-w-md`. Las entradas y el botón usan ancho completo y alto mínimo de 44 px; no se usan anchos rígidos ni contenido que exceda el contenedor. A partir de espacio suficiente, solo cambian separación y aire visual, no el orden ni la estructura. Esto mantiene el formulario completo sin scroll horizontal entre 320 y 1440 px CSS.

La composición usa una sola columna, con la secuencia visual y de tabulación: Cédula, Contraseña e Iniciar sesión. No se agrega un control para revelar contraseña, porque contradiría el requisito de enmascaramiento. Los estados `focus-visible` de las primitivas shadcn/ui se conservan con contraste semántico; no se elimina `outline`. Las transiciones serán discretas y respetarán `prefers-reduced-motion`.

Cada campo tendrá un `id` estable, `Label htmlFor`, `aria-invalid` cuando exista error y `aria-describedby` que apunte al mensaje asociado. El texto de error llevará un identificador único y una región de anuncio; el `Alert` de estado usará `role="status"`, `aria-live="polite"` y `aria-atomic="true"`. Tras un submit inválido, el foco pasa al primer campo inválido; esto no cambia la edición ni el error del otro campo.

Los estilos usan exclusivamente clases semánticas de Tailwind 4 y tokens existentes (`bg-background`, `text-foreground`, `bg-primary`, `text-destructive`); no introducen hexadecimales ni `var()` dentro de `className`. `cn` se reserva para combinar estados condicionales de error o pendiente. La paleta, tipografías cargadas y radio actuales dan coherencia sin modificar `app/globals.css`.

## Testing Strategy

La base actual ejecuta `vitest run` y dispone de un proyecto unitario de Node. La implementación conservará ese proyecto para `lib/auth/login-ui.ts` y añadirá, con dependencias de desarrollo fijadas a versiones exactas compatibles, un proyecto de Vitest con `jsdom` para pruebas de componente. Se incorporarán `fast-check` para propiedades y una biblioteca de pruebas DOM (`@testing-library/react`, `@testing-library/user-event` y sus matchers) para interacción y accesibilidad. No se modifica esa infraestructura en esta fase de diseño.

| Archivo de prueba propuesto | Cobertura |
| --- | --- |
| `lib/auth/login-ui.unit.test.ts` | Ejemplos de contraseña vacía, `401`, errores no reconocibles y todos los bordes de Cédula; pruebas de las Properties 1–6 con `fast-check`. |
| `components/auth/login-form.ui.test.tsx` | Labels, máscara, Alert, `aria-*`, pending, limpieza, foco, Enter/click equivalentes y la Property 7 con `fetch` simulado. |
| `tests/e2e/login-ui.spec.ts` | Recorridos de teclado y comprobaciones de desbordamiento a 320, 375, 768 y 1440 px en un navegador real, una vez que el proyecto incorpore una herramienta E2E fijada. |

Cada prueba de propiedad ejecutará al menos 100 iteraciones y llevará exactamente un comentario de trazabilidad con el formato `Feature: login-ui, Property N: <texto de la propiedad>`. Las propiedades prueban módulos puros o `fetch` simulado; no realizan solicitudes al backend ni persisten tokens. Las pruebas de ejemplo complementan, no duplican, las propiedades: cubren composición shadcn/ui, DOM, regiones accesibles, teclado, respuesta visual y breakpoints.

## Referencias verificadas

- Configuración real de shadcn/ui: [`components.json`](../../../components.json); existe [`components/ui/button.tsx`](../../../components/ui/button.tsx) y faltan `input`, `label` y `alert`.
- Contrato real: [`app/api/v1/auth/login/route.ts`](../../../app/api/v1/auth/login/route.ts), [`lib/validations/auth.schema.ts`](../../../lib/validations/auth.schema.ts) y [`lib/services/auth.service.ts`](../../../lib/services/auth.service.ts).
- Arquitectura y versiones: [`package.json`](../../../package.json), [`vitest.config.ts`](../../../vitest.config.ts), React 19.2.4, Next.js 16.2.12 y Tailwind CSS 4.3.3 resuelto.
- Next.js local: [`use client`](../../../node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md), [`Forms`](../../../node_modules/next/dist/docs/01-app/02-guides/forms.md) y [`Route Handlers`](../../../node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md).
