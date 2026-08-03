# Implementation Plan: operational-web-application
## Overview
Cliente Next.js/TypeScript incremental que consume sólo `/api/v1`; no incluye persistencia, refresh, cookies, BFF, logout ni cambios de backend.
## Previsión de carga de revisión
| Campo | Valor |
|---|---|
| Líneas estimadas | 2.400–3.100 |
| Riesgo de 400 líneas | Alto |
| Cortes de revisión reversibles | 6 |
| Estrategia | aplicar por unidades, sin crear ramas, commits ni PRs |
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
### Unidades de trabajo reversibles
| Unidad | Alcance / prueba focalizada | Arnés / límite de reversión |
|---|---|---|
| Fundación | `pnpm vitest run --project unit lib/operational-api`; mocks de `/api/v1` | eliminar `lib/operational-api/**` y `components/access/**` |
| Shell | `pnpm vitest run --project ui components/access`; navegación simulada | eliminar rutas y shell operativo |
| Administración | `pnpm vitest run --project ui components/operational/admin`; `fetch` mock | eliminar páginas/componentes admin |
| Cuestionarios y QR | `pnpm vitest run --project ui components/operational/questionnaires`; API mock | eliminar editor/asignaciones/QR |
| Respuestas y carga | `pnpm vitest run --project ui components/operational/scan`; presign/PUT mock | eliminar `/scan` y cliente upload |
| Reportes | `pnpm vitest run --project ui components/operational/reports`; API mock | eliminar páginas de reportes |
`pnpm playwright test tests/e2e/operational-*.spec.ts` valida cada unidad integrada; usa escenarios API mockeados, sin modificar servicios.
## Tasks
### Fase 1 — Fundación: contratos, API y acceso
- [x] 1.1 Crear `lib/operational-api/{contracts,operation-state}.ts` con DTO, `ProtectedResult`, estado por operación y redacción segura; _Requirements: 7.1–7.9, 8.1–8.4_; _Proof: prueba unitaria de tipos/resultados_.
- [x] 1.2 **RED Property 2: Custodia del acceso**: crear `lib/operational-api/client.pbt.test.ts` con comentario requerido y `fast-check` (≥100); _Requirements: 1.4, 7.4, 8.1–8.3_; _Proof: falla antes del cliente_.
- [x] 1.3 **GREEN Property 2**: crear `lib/operational-api/client.ts`, Authorization privado, JSON `unknown` y proyecciones sin secretos; _Requirements: 7.1–7.9, 8.1–8.3_; _Proof: 1.2 pasa ≥100 casos_.
- [x] 1.4 **REFACTOR Property 2**: simplificar `client.ts` sin cambiar proyección segura; _Requirements: 1.4, 7.4, 8.1–8.3_; _Proof: repetir 1.2 (≥100)_.
- [x] 1.5 **RED Property 6: Resultado de operación**: crear `lib/operational-api/operation-state.pbt.test.ts` con `fast-check` (≥100); _Requirements: 3.6–3.7, 4.7, 5.7–5.8, 6.7, 7.1, 7.3–7.8, 8.4_; _Proof: falla antes de reducir resultados_.
- [x] 1.6 **GREEN Property 6**: implementar en `operation-state.ts` pendiente único, borrador no sensible, issues visibles y estado general único; _Requirements: 7.1, 7.3–7.8, 8.4_; _Proof: 1.5 pasa ≥100 casos_.
- [x] 1.7 **REFACTOR Property 6**: extraer mapeos seguros reutilizables de `operation-state.ts`; _Requirements: 3.6–3.7, 4.7, 5.7–5.8, 6.7, 7.1, 7.3–7.8_; _Proof: repetir 1.5 (≥100)_.
- [x] 1.8 Crear `components/access/{access-provider,access-shell,status-region}.tsx` y actualizar `app/layout.tsx`, `app/page.tsx`, `components/auth/login-form.tsx` para estado efímero y cambio obligatorio exclusivo; _Requirements: 1.1–1.4, 8.1–8.2, 9.4_; _Proof: UI mockeada_.
- [x] 1.9 Crear `components/access/access-shell.ui.test.tsx` para login inválido/restringido/disponible, ARIA y ausencia de secreto; _Requirements: 1.1–1.4, 8.2, 9.3–9.4_; _Proof: RTL/jsdom_.
- [x] 1.10 Crear `tests/e2e/operational-access.spec.ts` para login→rol y cambio obligatorio; _Requirements: 1.1–1.3_; _Proof: Playwright con `/api/v1/auth/*` mockeado_.

### Fase 2 — Shell y navegación
- [x] 2.1 **RED Property 1: Superficie autorizada**: crear `lib/operational-ui/routes.pbt.test.ts` con `Feature: operational-web-application, Property 1: Superficie autorizada` y `fast-check` (≥100); _Requirements: 1.1–1.3, 2.4_; _Proof: falla antes de las rutas_.
- [x] 2.2 **GREEN Property 1**: crear `lib/operational-ui/routes.ts` con inicio/menú permitidos por rol y rechazo seguro; _Requirements: 1.1–1.3, 2.1–2.4_; _Proof: 2.1 pasa ≥100 casos_.
- [x] 2.3 **REFACTOR Property 1**: consolidar rutas internas constantes en `routes.ts`; _Requirements: 1.1–1.3, 2.4_; _Proof: repetir 2.1 (≥100)_.
- [x] 2.4 **RED Property 7: Equivalencia de activación**: crear `components/operational/action-activation.pbt.test.tsx` con comentario de Property 7 y `fast-check` (≥100); _Requirements: 9.6_; _Proof: falla antes del activador compartido_.
- [x] 2.5 **GREEN Property 7**: crear `components/operational/action-activation.tsx` para activar igual por click/Enter/Espacio; _Requirements: 9.2, 9.6_; _Proof: 2.4 pasa ≥100 casos_.
- [x] 2.6 **REFACTOR Property 7**: reutilizar el activador sin alterar eventos observables; _Requirements: 9.6_; _Proof: repetir 2.4 (≥100)_.
- [x] 2.7 Crear `components/access/{role-route-gate,role-navigation}.tsx` y shells `app/operaciones/page.tsx`, `app/scan/page.tsx`; _Requirements: 2.1–2.4, 9.1–9.2_; _Proof: rutas no autorizadas reemplazan por inicio seguro_.
- [x] 2.8 Crear `components/access/role-navigation.ui.test.tsx` y `tests/e2e/operational-navigation.spec.ts` para menú, Tab/Mayús+Tab, Link, teclado/puntero y denegación segura; _Requirements: 2.1–2.4, 9.1–9.2, 9.6_; _Proof: RTL y Playwright_.
### Fase 3 — Administración
- [x] 3.1 Crear `lib/operational-api/{users,branches,assignments}.ts` para los GET/POST/PATCH/DELETE permitidos y asignación de empleado; _Requirements: 3.1–3.7, 7.1–7.8_; _Proof: clientes devuelven `ProtectedResult`_.
- [x] 3.2 Crear `components/operational/admin/{users,branches,assignment-panel}.tsx` y páginas `app/operaciones/{usuarios,sucursales,sucursales/[id]/empleados}/page.tsx`; _Requirements: 3.1–3.7, 8.4, 9.1–9.4_; _Proof: rol Secretario restringe controles_.
- [x] 3.3 Crear `components/operational/admin/admin.ui.test.tsx` para 409/422, errores asociados, doble envío y ARIA; _Requirements: 3.2, 3.4, 3.6–3.7, 7.1, 7.5–7.8, 9.3–9.4_; _Proof: RTL/jsdom_.
- [x] 3.4 Crear `tests/e2e/operational-admin.spec.ts` para CRUD/consulta por rol y asignaciones con `/api/v1` mockeado; _Requirements: 3.1–3.7_; _Proof: Playwright_.
### Fase 4 — Cuestionarios y QR
- [x] 4.1 Crear `lib/operational-api/questionnaires.ts` y `questionnaire-draft.ts` para CRUD, versiones, publicar, sucursales y QR; _Requirements: 4.1–4.7_; _Proof: PATCH completo tipado_.
- [x] 4.2 **RED Property 3: Cuestionario consistente**: crear `lib/operational-api/questionnaire-draft.pbt.test.ts` con comentario de Property 3 y `fast-check` (≥100); _Requirements: 4.3_; _Proof: falla antes de normalizar_.
- [x] 4.3 **GREEN Property 3**: normalizar en `questionnaire-draft.ts` `clientKey`, orden 1..n, tipo/configuración y PATCH completo; _Requirements: 4.3_; _Proof: 4.2 pasa ≥100 casos_.
- [x] 4.4 **REFACTOR Property 3**: aislar serialización pura de `questionnaire-draft.ts`; _Requirements: 4.3_; _Proof: repetir 4.2 (≥100)_.
- [x] 4.5 Crear `components/operational/questionnaires/{editor,version-editor,question-builder,branch-assignment-panel,qr-panel}.tsx` y páginas `app/operaciones/cuestionarios/**`; _Requirements: 4.1–4.7, 9.1–9.4_; _Proof: publicar usa sólo resultado API_.
- [x] 4.6 Crear `components/operational/questionnaires/questionnaires.ui.test.tsx` para 11 configuraciones, 409/422, QR y errores ARIA; _Requirements: 4.1–4.7, 9.3–9.4_; _Proof: RTL/jsdom_.
- [x] 4.7 Crear `tests/e2e/operational-questionnaires.spec.ts` para cuestionario→versión→publicar→asignar→QR; _Requirements: 4.1–4.6_; _Proof: Playwright API mock_.
### Fase 5 — Respuestas y carga
- [x] 5.1 Crear `lib/operational-api/{scan,responses,uploads}.ts` para scan, POST/PATCH response, presign y PUT sin Bearer; _Requirements: 5.1, 5.3–5.8, 7.1–7.8_; _Proof: sólo `objectKey` llega a respuesta_.
- [x] 5.2 **RED Property 4: Respuesta dinámica segura**: crear `lib/operational-api/response-input.pbt.test.ts` con comentario de Property 4 y `fast-check` (≥100); _Requirements: 5.2–5.5_; _Proof: falla antes del despachador_.
- [x] 5.3 **GREEN Property 4**: crear `lib/operational-api/response-input.ts` para `AnswerInput` tipado y `read_only`; _Requirements: 5.2–5.5_; _Proof: 5.2 pasa ≥100 casos_.
- [x] 5.4 **REFACTOR Property 4**: separar validación pura por tipo en `response-input.ts`; _Requirements: 5.2–5.5_; _Proof: repetir 5.2 (≥100)_.
- [x] 5.5 Crear `components/operational/scan/{scan-resolver,dynamic-response-form,question-control,upload-field}.tsx` y `app/scan/[qrToken]/page.tsx`; _Requirements: 5.1–5.8, 8.4, 9.1–9.4_; _Proof: `read_only` inhabilita submit/presign_.
- [x] 5.6 Crear `components/operational/scan/scan.ui.test.tsx` para 11 tipos, absent/editable/read_only, carga y 409/422/red; _Requirements: 5.1–5.8, 7.5–7.8, 9.3–9.4_; _Proof: RTL con fetch/PUT mock_.
- [x] 5.7 Crear `tests/e2e/operational-responses.spec.ts` para QR, crear/editar, conflicto que reescanea y archivo→presign→PUT→objectKey; _Requirements: 5.1–5.8_; _Proof: Playwright API mock_.
### Fase 6 — Reportes
- [x] 6.1 Crear `lib/operational-api/{report-query,reports}.ts` para parámetros permitidos, fechas reales, 31 días y paginación; _Requirements: 6.1–6.7, 7.6–7.8_; _Proof: ninguna query contiene filtros ajenos_.
- [x] 6.2 **RED Property 5: Consultas de reporte válidas**: crear `lib/operational-api/report-query.pbt.test.ts` con comentario de Property 5 y `fast-check` (≥100); _Requirements: 6.2–6.6_; _Proof: falla antes del constructor_.
- [x] 6.3 **GREEN Property 5**: implementar en `report-query.ts` fechas/rangos, filtros permitidos y páginas válidas; _Requirements: 6.2–6.6_; _Proof: 6.2 pasa ≥100 casos_.
- [x] 6.4 **REFACTOR Property 5**: deduplicar reglas de rango/paginación en `report-query.ts`; _Requirements: 6.2–6.6_; _Proof: repetir 6.2 (≥100)_.
- [x] 6.5 Crear `components/operational/reports/{report-filters,paginated-results,pagination}.tsx` y `app/operaciones/reportes/{pending,compliance,history}/page.tsx`; _Requirements: 6.1–6.7, 9.1–9.4_; _Proof: filtros conservan datos ante 422_.
- [x] 6.6 Crear `components/operational/reports/reports.ui.test.tsx` para filtros, rango, paginación, 422 y ARIA; _Requirements: 6.2–6.7, 7.6–7.8, 9.3–9.4_; _Proof: RTL/jsdom_.
- [x] 6.7 Crear `tests/e2e/operational-reports.spec.ts` para pending/compliance/history y páginas válidas; _Requirements: 6.1–6.7_; _Proof: Playwright API mock_.
### Fase 7 — Integración accesible
- [x] 7.1 Crear `tests/e2e/operational-accessibility.spec.ts` para teclado/puntero equivalentes y 320/768/1024/1440 sin overflow horizontal; _Requirements: 9.1–9.6_; _Proof: Playwright en cuatro viewports_.
## Notes
- Todas las tareas de prueba (RED, PBT, UI y E2E) son obligatorias y deben completarse antes de dar por terminada la implementación.
- Cada PBT ejecuta como mínimo 100 casos y debe conservar el comentario `Feature: operational-web-application, Property N: <Title>`.
- Quedan explícitamente fuera persistencia/restauración, refresh, cookies, BFF, logout, Server Actions, backend y lectura física de QR.
## Task Dependency Graph
```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.5", "1.8"] },
    { "id": 2, "tasks": ["1.3", "1.6", "1.9"] },
    { "id": 3, "tasks": ["1.4", "1.7", "1.10"] },
    { "id": 4, "tasks": ["2.1", "2.4"] },
    { "id": 5, "tasks": ["2.2", "2.5"] },
    { "id": 6, "tasks": ["2.3", "2.6"] },
    { "id": 7, "tasks": ["2.7"] },
    { "id": 8, "tasks": ["2.8"] },
    { "id": 9, "tasks": ["3.1", "4.1", "5.1", "6.1"] },
    { "id": 10, "tasks": ["3.2", "4.2", "5.2", "6.2"] },
    { "id": 11, "tasks": ["3.3", "4.3", "5.3", "6.3"] },
    { "id": 12, "tasks": ["3.4", "4.4", "5.4", "6.4"] },
    { "id": 13, "tasks": ["4.5", "5.5", "6.5"] },
    { "id": 14, "tasks": ["4.6", "5.6", "6.6"] },
    { "id": 15, "tasks": ["4.7", "5.7", "6.7"] },
    { "id": 16, "tasks": ["7.1"] }
  ]
}
```