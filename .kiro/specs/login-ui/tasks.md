# Implementation Plan: login-ui

## Overview
Implementar únicamente la UI de inicio de sesión en `/`, sin modificar backend, persistir tokens, navegar a zonas protegidas, ni incorporar registro, refresh, logout o cambio de contraseña.

## Previsión de carga de revisión
| Campo | Valor |
|---|---|
| Líneas modificadas estimadas | 1.100–1.500 |
| Riesgo del presupuesto de 400 líneas | Alto |
| PRs encadenados recomendados | Sí |
| División sugerida | Fundaciones → lógica pura → formulario → navegador |
| Estrategia de entrega | Cadena sobre rama de funcionalidad (seleccionada) |
| Rama de integración | Rama de funcionalidad/seguimiento; solo esta rama se integrará posteriormente en `main`. |
| Bases de la cadena | El PR #1 se basa en la rama de funcionalidad/seguimiento; cada PR posterior se basa en la rama del PR inmediatamente anterior. |
Decisión necesaria antes de aplicar: No
PRs encadenados recomendados: Sí
Estrategia de cadena: cadena sobre rama de funcionalidad
Riesgo del presupuesto de 400 líneas: Alto

### Unidades de trabajo sugeridas
| Unidad | Objetivo y límite reversible | Prueba focalizada | Arnés de ejecución | Base y destino del PR |
|---|---|---|---|---|
| 1 | Primitivas y configuración; revertir `package.json`, `package-lock.json`, `vitest.config.ts`, `playwright.config.ts`, `tests/setup.dom.ts` y `components/ui/{input,label,alert}.tsx`. | `npm test -- --project unit` | No aplica: aún no hay pantalla integrada. | PR #1: se basa en la rama de funcionalidad/seguimiento y la usa como destino. |
| 2 | Lógica pura; revertir `lib/auth/login-ui.ts` y `lib/auth/login-ui.unit.test.ts`. | `npm test -- lib/auth/login-ui.unit.test.ts --project unit` | No aplica: módulo sin E/S. | PR #2: se basa en la rama del PR #1 y la usa como destino. |
| 3 | Formulario accesible; revertir `components/auth/login-form.tsx` y `components/auth/login-form.ui.test.tsx`. | `npm test -- components/auth/login-form.ui.test.tsx --project ui` | `jsdom` con `fetch` simulado. | PR #3: se basa en la rama del PR #2 y la usa como destino. |
| 4 | Host y comprobación de navegador; revertir `app/page.tsx`, `app/layout.tsx` y `tests/e2e/login-ui.spec.ts`. | `npx playwright test tests/e2e/login-ui.spec.ts` | Navegador Chromium automatizado en 320, 375, 768 y 1440 px. | PR #4: se basa en la rama del PR #3 y la usa como destino. |

## Tasks
- [x] 1. Preparar las primitivas y la infraestructura de pruebas.
  - [x] 1.1 Actualizar `package.json` y `package-lock.json` con `@testing-library/react@16.3.2`, `@testing-library/jest-dom@7.0.0`, `@testing-library/user-event@14.6.1`, `fast-check@4.9.0`, `jsdom@30.0.1` y `@playwright/test@1.62.1`; tratarlo como cambio de configuración de riesgo medio, comprobar compatibilidad y dejar una reversión limitada a ambos archivos.
  - [x] 1.2 Ampliar `vitest.config.ts` y crear `tests/setup.dom.ts` con el proyecto `ui` en `jsdom`, matchers DOM y patrones `.ui.test.tsx` sin alterar los proyectos `unit` e `integration`.
  - [x] 1.3 Generar `components/ui/input.tsx`, `components/ui/label.tsx` y `components/ui/alert.tsx` mediante `npx shadcn@4.16.1 add input label alert`; conservar `components/ui/button.tsx`.
  - [x] 1.4 Crear `playwright.config.ts` para pruebas automatizadas y acotadas de `tests/e2e/login-ui.spec.ts`, incluida la instalación reproducible de Chromium con `npx playwright install chromium`.
  - [x] 1.5 RED: escribir `tests/e2e/login-ui.spec.ts` para teclado y ausencia de desbordamiento a 320, 375, 768 y 1440 px; debe fallar antes de crear la UI. _Requisitos: 5.1, 5.4, 5.5_
- [x] 2. Construir y probar la lógica pura de `lib/auth/login-ui.ts`.
  - [x] 2.1 RED: añadir a `lib/auth/login-ui.unit.test.ts` la Propiedad 1 con 100 casos y el comentario de trazabilidad exigido; incluir bordes de Cédula y Contraseña vacía. _Requisitos: 2.1, 2.2, 2.4_
  - [x] 2.2 GREEN: definir constantes, tipos planos, validación ASCII de Cédula, validación de Contraseña y decisión de envío en `lib/auth/login-ui.ts`. _Requisitos: 2.1, 2.2, 2.4_
  - [x] 2.3 REFACTOR: simplificar los generadores y nombres de la Propiedad 1 sin reducir cobertura; ejecutar `npm test -- lib/auth/login-ui.unit.test.ts --project unit`. _Propiedad 1; requisitos: 2.1, 2.2, 2.4_
  - [x] 2.4 RED: añadir la Propiedad 2 para edición aislada de `cedula` y `password` en `lib/auth/login-ui.unit.test.ts`. _Requisito: 2.3_
  - [x] 2.5 GREEN: implementar la reevaluación de un solo campo que preserve exactamente valor y error del otro. _Requisito: 2.3_
  - [x] 2.6 REFACTOR: eliminar duplicación de fixtures de la Propiedad 2 y mantener sus 100 casos verdes. _Propiedad 2; requisito: 2.3_
  - [x] 2.7 RED: añadir la Propiedad 3 que verifica `POST`, JSON y el body exacto `{ cedula, password }`. _Requisito: 3.1_
  - [x] 2.8 GREEN: implementar el constructor de solicitud mínima sin claves adicionales ni transformación de valores. _Requisito: 3.1_
  - [x] 2.9 REFACTOR: consolidar arbitrarios de credenciales válidas y mantener verde la Propiedad 3. _Propiedad 3; requisito: 3.1_
  - [x] 2.10 RED: añadir la Propiedad 4 para éxito completo, sesión disponible y estado restringido. _Requisitos: 3.3, 4.3, 4.4, 4.5_
  - [x] 2.11 GREEN: implementar guard de payload `unknown` y derivación de `SessionState` efímero disponible o restringido. _Requisitos: 3.3, 4.3, 4.4, 4.5_
  - [x] 2.12 REFACTOR: extraer fixtures de éxito y conservar verde la Propiedad 4. _Propiedad 4; requisitos: 3.3, 4.3, 4.4, 4.5_
  - [x] 2.13 RED: añadir la Propiedad 5 para traducir únicamente rutas iniciales `cedula` y `password` de `422`. _Requisito: 3.5_
  - [x] 2.14 GREEN: implementar la traducción localizada de problemas `422` sin crear sesión. _Requisito: 3.5_
  - [x] 2.15 REFACTOR: unificar los arbitrarios de rutas y mantener verde la Propiedad 5. _Propiedad 5; requisito: 3.5_
  - [x] 2.16 RED: añadir la Propiedad 6 para estados inesperados y `200` malformado reintentables sin datos visibles del body. _Requisito: 3.6_
  - [x] 2.17 GREEN: implementar el resultado seguro para red, JSON inválido, estados no previstos y payload incompleto. _Requisito: 3.6_
  - [x] 2.18 REFACTOR: centralizar resultados seguros y conservar verde la Propiedad 6. _Propiedad 6; requisito: 3.6_

- [x] 3. Implementar el formulario cliente y el host de `/`.
  - [x] 3.1 RED: crear `components/auth/login-form.ui.test.tsx` para primitivas shadcn/ui, etiquetas enlazadas, máscara, errores locales y foco del primer error. _Requisitos: 1.1, 1.2, 1.3, 2.1, 2.2, 5.1, 5.2_
  - [x] 3.2 GREEN: crear `components/auth/login-form.tsx` como único Client Component con `<form onSubmit>`, `Input`, `Label`, `Alert`, `Button`, `aria-invalid` y `aria-describedby`. _Requisitos: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 5.1, 5.2_
  - [x] 3.3 REFACTOR: reducir duplicación de aserciones y mantener verde la prueba de composición. _Prueba de componente 1; requisitos: 1.1–1.3, 2.1–2.4, 5.1–5.2_
  - [x] 3.4 RED: ampliar `components/auth/login-form.ui.test.tsx` con click/Enter equivalentes, pendiente, `aria-busy`, `200`, `401`, `422` y fallo seguro. _Requisitos: 3.2–3.6, 4.2, 5.3, 5.5_
  - [x] 3.5 GREEN: conectar `fetch('/api/v1/auth/login')`, estado pendiente, mensajes seguros, limpieza de Contraseña y conservación de Cédula para todos los resultados. _Requisitos: 3.1–3.6, 4.2, 5.3, 5.5_
  - [x] 3.6 REFACTOR: aislar mocks de `fetch` y mantener verde la prueba de interacción. _Prueba de componente 2; requisitos: 3.1–3.6, 4.2, 5.3, 5.5_
  - [x] 3.7 RED: añadir la Propiedad 7 con `fetch` simulado para no filtrar tokens, vaciar Contraseña en `401`/`422` y restringir `passwordChangeRequired`. _Requisitos: 4.1–4.5_
  - [x] 3.8 GREEN: mantener `accessToken` y `refreshToken` solo en estado efímero no renderizado, sin URL ni almacenamiento, y bloquear la disponibilidad de sesión restringida. _Requisitos: 3.3–3.5, 4.1–4.5_
  - [x] 3.9 REFACTOR: consolidar fixtures secretos y verificar que los mensajes y DOM no contengan tokens. _Propiedad 7; requisitos: 4.1–4.5_
  - [x] 3.10 Sustituir `app/page.tsx` por el host Server Component de `/`, encabezado con decoración QR `aria-hidden` y panel mobile-first que monte `LoginForm`. _Requisitos: 1.1, 5.4_
  - [x] 3.11 Ajustar `app/layout.tsx` con metadata y `lang` en español, sin añadir capa de autenticación. _Requisito: 5.3_
- [x] 4. Completar la verificación automatizada de navegador.
  - [x] 4.1 GREEN: ejecutar y completar `tests/e2e/login-ui.spec.ts` con Tab/Mayús+Tab, activación con teclado y ausencia de scroll horizontal en los cuatro anchos. _Requisitos: 5.1, 5.4, 5.5_
  - [x] 4.2 REFACTOR: estabilizar selectores por rol/etiqueta y preservar los cuatro recorridos verdes. _Prueba de componente/navegador 3; requisitos: 5.1, 5.4, 5.5_
- [x] 5. Punto de control final.
  - Asegurar que todas las pruebas pasen y consultar a la persona usuaria si surge alguna duda.

## Notes
- Cada prueba de propiedad usa `fast-check`, al menos 100 casos y exactamente un comentario `Feature: login-ui, Property N: <texto de la propiedad>`.
- Todas las tareas RED, GREEN y REFACTOR —incluidas las de navegador— son obligatorias. No existen tareas opcionales.
- La secuencia RED → GREEN → REFACTOR para cada requisito y la dependencia del DAG (módulo 2.1 debe ejecutarse antes que 2.2, 2.2 antes que 2.3, etc.) se mantienen de forma estricta.

## Task Dependency Graph
```json
{"waves":[{"id":0,"tasks":["1.1","1.3"]},{"id":1,"tasks":["1.2","1.4"]},{"id":2,"tasks":["1.5","2.1"]},{"id":3,"tasks":["2.2"]},{"id":4,"tasks":["2.3"]},{"id":5,"tasks":["2.4"]},{"id":6,"tasks":["2.5"]},{"id":7,"tasks":["2.6"]},{"id":8,"tasks":["2.7"]},{"id":9,"tasks":["2.8"]},{"id":10,"tasks":["2.9"]},{"id":11,"tasks":["2.10"]},{"id":12,"tasks":["2.11"]},{"id":13,"tasks":["2.12"]},{"id":14,"tasks":["2.13"]},{"id":15,"tasks":["2.14"]},{"id":16,"tasks":["2.15"]},{"id":17,"tasks":["2.16"]},{"id":18,"tasks":["2.17"]},{"id":19,"tasks":["2.18"]},{"id":20,"tasks":["3.1"]},{"id":21,"tasks":["3.2"]},{"id":22,"tasks":["3.3"]},{"id":23,"tasks":["3.4"]},{"id":24,"tasks":["3.5"]},{"id":25,"tasks":["3.6"]},{"id":26,"tasks":["3.7"]},{"id":27,"tasks":["3.8"]},{"id":28,"tasks":["3.9"]},{"id":29,"tasks":["3.10","3.11"]},{"id":30,"tasks":["4.1"]},{"id":31,"tasks":["4.2"]}]}
```
