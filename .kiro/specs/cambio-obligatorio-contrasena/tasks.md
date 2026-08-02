# Implementation Plan: cambio-obligatorio-contrasena

## Overview

Implementar la interfaz para el cambio obligatorio de contrasena cuando POST /api/v1/auth/login devuelve passwordChangeRequired true. Consume solo contratos existentes, conserva secretos en memoria volatil y, tras un cambio exitoso, elimina secretos, desactiva el modo restringido, vuelve al formulario de login y exige nueva autenticacion.

## Prevision de carga de revision

| Campo | Valor |
|---|---|
| Lineas modificadas estimadas | ~700 |
| Riesgo del presupuesto de 400 lineas | Alto |
| PRs encadenados recomendados | Si |
| Division sugerida | Logica pura, componente, integracion, E2E |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Unidades de trabajo sugeridas

| Unidad | Limite reversible | Prueba focalizada | Arnes |
|---|---|---|---|
| 1 | lib/auth/password-change-ui.ts y su prueba unitaria | npx vitest run --project unit lib/auth/password-change-ui.unit.test.ts | Modulo sin E/S |
| 2 | components/auth/password-change-form.tsx y su prueba UI | npx vitest run --project ui components/auth/password-change-form.ui.test.tsx | jsdom con fetch simulado |
| 3 | components/auth/login-form.tsx y su prueba UI | npx vitest run --project ui components/auth/login-form.ui.test.tsx | jsdom con fetch simulado |
| 4 | tests/e2e/password-change-required.spec.ts | npx playwright test tests/e2e/password-change-required.spec.ts | Chromium automatizado |

## Tasks

- [x] 1. Logica pura y pruebas unitarias.
  - [x] 1.1 RED escribir prueba unitaria de lib/auth/password-change-ui con ejemplos de minimo 8 y coincidencia y Property 3 request minimo autenticado con fast-check 100 casos. Requisitos 2.1, 2.2, 2.7, 3.1, 3.2, 3.3
  - [x] 1.2 GREEN implementar constantes, tipos, validateNewPassword, validateConfirmPassword y buildChangePasswordRequest en lib/auth/password-change-ui.ts. Requisitos 2.1, 2.2, 2.7, 3.1, 3.2
  - [x] 1.3 REFACTOR simplificar arbitrarios y fixtures del modulo puro. Requisitos 3.1, 3.2, 3.3
- [x] 2. Componente PasswordChangeForm.
  - [x] 2.1 RED escribir prueba UI de password-change-form con primitivas, etiquetas, mascara, foco inicial y navegacion Tab. Requisitos 1.1, 1.2, 1.3, 5.1, 5.2
  - [x] 2.2 GREEN crear components/auth/password-change-form.tsx como Client Component con form, Input, Label, Alert, Button y aria. Requisitos 1.1, 1.2, 1.3, 2.1, 2.2, 5.1, 5.2
  - [x] 2.3 REFACTOR reducir duplicacion de aserciones de composicion. Requisitos 1.1, 1.2, 1.3, 5.1, 5.2
  - [x] 2.4 RED ampliar prueba UI con validacion local, foco al primer error, bloqueo pendiente y mensajes accesibles. Requisitos 2.5, 2.6, 3.3, 5.1, 5.2
  - [x] 2.5 GREEN implementar validacion en handleSubmit, disabled durante envio, mensaje en proceso y foco al error. Requisitos 2.5, 2.6, 3.3, 5.1, 5.2
  - [x] 2.6 REFACTOR aislar mocks de fetch de la prueba de interaccion. Requisitos 2.5, 2.6, 3.3
  - [x] 2.7 RED anadir Property 1 no exposicion de secretos revisando DOM, URL, almacenamiento y mensajes. Requisitos 4.1, 4.2, 4.6
  - [x] 2.8 GREEN mantener contrasenas y token solo en estado efimero no renderizado, sin URL ni almacenamiento. Requisitos 4.1, 4.2, 4.6
  - [x] 2.9 REFACTOR consolidar fixtures secretos y mantener verde Property 1. Requisitos 4.1, 4.2, 4.6
  - [x] 2.10 RED ampliar prueba con 200, 401, 422 con y sin newPassword, red, JSON invalido y transicion a login. Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
  - [x] 2.11 GREEN implementar manejo HTTP, custodia del token, limpieza de entradas, onComplete y mensajes seguros. Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
  - [x] 2.12 REFACTOR consolidar fixtures de respuesta. Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
  - [x] 2.13 RED anadir Property 4 equivalencia teclado y puntero con fast-check 100 casos. Requisitos 5.3
  - [x] 2.14 GREEN garantizar que clic, Enter y Espacio producen identica validacion y estado. Requisitos 5.3
  - [x] 2.15 REFACTOR consolidar fixtures de activacion y mantener verde Property 4. Requisitos 5.3
- [x] 3. Integrar PasswordChangeForm con LoginForm.
  - [x] 3.1 RED ampliar prueba UI de login-form con escenarios de cambio obligatorio. Requisitos 1.1, 1.4, 4.3, 4.4
  - [x] 3.2 GREEN integrar restrictedSession, renderizado condicional y manejo de sesion restringida en login-form.tsx. Requisitos 1.1, 1.4, 4.4
  - [x] 3.3 REFACTOR aislar mocks de fetch para login y cambio. Requisitos 1.1, 1.4, 4.4
  - [x] 3.4 RED anadir Property 2 transicion de modo restringido a login con fast-check 100 casos. Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
  - [x] 3.5 GREEN limpiar restrictedSession tras 200, mantener sesion deshabilitada, llamar onComplete y mostrar login con exito. Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
  - [x] 3.6 REFACTOR unificar fixtures de sesion restringida y mantener verde Property 2. Requisitos 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
- [x] 4. Verificacion automatizada de navegador.
  - [x] 4.1 RED crear tests/e2e/password-change-required.spec.ts con el flujo completo. Requisitos 1.1, 4.1, 4.3, 4.4
  - [x] 4.2 GREEN implementar recorridos para 200, 401 y 422 con foco, navegacion y mensajes. Requisitos 1.1, 4.1, 4.3, 4.4, 4.6, 4.7, 4.8, 4.9
  - [x] 4.3 REFACTOR estabilizar selectores por rol y etiqueta. Requisitos 1.1, 4.1, 4.2, 4.3, 4.4
  - [x] 4.4 RED anadir Property 5 accesibilidad revisando etiquetas, orden de tabulado y regiones de estado. Requisitos 1.1, 1.2, 1.3, 2.6, 5.1, 5.2, 5.3
  - [x] 4.5 GREEN verificar aria-invalid, aria-describedby, aria-live, foco inicial y navegacion por Tab en E2E. Requisitos 1.1, 1.2, 1.3, 2.6, 5.1, 5.2, 5.3
  - [x] 4.6 REFACTOR consolidar fixtures y mantener verde Property 5. Requisitos 1.1, 1.2, 1.3, 2.6, 5.1, 5.2, 5.3
- [x] 5. Punto de control final.
  - [x] 5.1 Ejecutar las tres suites focalizadas y asegurar que todas las pruebas pasen.

## Notes

- Cada prueba de propiedad usa fast-check, al menos 100 casos y un comentario Feature cambio-obligatorio-contrasena Property N.
- Todas las tareas RED, GREEN y REFACTOR son obligatorias.
- La secuencia RED GREEN REFACTOR y las dependencias del DAG se mantienen estrictamente.
- El formato de pruebas sigue lib/auth/login-ui.unit.test.ts, components/auth/login-form.ui.test.tsx y tests/e2e/login-ui.spec.ts.
- Comandos focalizados npx vitest run --project unit, npx vitest run --project ui y npx playwright test.

## Task Dependency Graph

```json
{"waves":[{"id":0,"tasks":["1.1"]},{"id":1,"tasks":["1.2"]},{"id":2,"tasks":["1.3"]},{"id":3,"tasks":["2.1"]},{"id":4,"tasks":["2.2"]},{"id":5,"tasks":["2.3"]},{"id":6,"tasks":["2.4"]},{"id":7,"tasks":["2.5"]},{"id":8,"tasks":["2.6"]},{"id":9,"tasks":["2.7"]},{"id":10,"tasks":["2.8"]},{"id":11,"tasks":["2.9"]},{"id":12,"tasks":["2.10"]},{"id":13,"tasks":["2.11"]},{"id":14,"tasks":["2.12"]},{"id":15,"tasks":["2.13"]},{"id":16,"tasks":["2.14"]},{"id":17,"tasks":["2.15"]},{"id":18,"tasks":["3.1"]},{"id":19,"tasks":["3.2"]},{"id":20,"tasks":["3.3"]},{"id":21,"tasks":["3.4"]},{"id":22,"tasks":["3.5"]},{"id":23,"tasks":["3.6"]},{"id":24,"tasks":["4.1"]},{"id":25,"tasks":["4.2"]},{"id":26,"tasks":["4.3"]},{"id":27,"tasks":["4.4"]},{"id":28,"tasks":["4.5"]},{"id":29,"tasks":["4.6"]},{"id":30,"tasks":["5.1"]}]}
```
