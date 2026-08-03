# Diseño técnico — Aplicación web operativa

## Overview

El primer corte extiende la página actual con una aplicación operativa para Administrador, Secretario y Empleado. Consume los contratos existentes de `/api/v1`; no modifica rutas API, backend ni infraestructura. La UI es española, accesible y mobile-first.

Las guías locales de Next.js 16 confirman páginas/layouts Server por defecto, islands con `'use client'`, `Link` para navegación y `params` asíncronos. Como el acceso existe sólo tras login en el navegador, los datos protegidos se cargan desde componentes cliente, no desde Server Components.

## Architecture

```mermaid
flowchart LR
  Login[Login existente] --> Access[AccessProvider efímero]
  Access --> Gate[RoleRouteGate]
  Gate --> UI[Islas cliente por dominio]
  UI --> Client[Operational API client]
  Client --> API[/api/v1 existente]
  Upload[Archivo local] --> Presign[POST presign] --> Put[PUT uploadUrl] --> Client
```

| Decisión | Elección y fundamento |
|---|---|
| App Router | `app/**/page.tsx` y layouts serán shells Server; cada feature interactiva será Client Component. El layout no leerá request/cookies ni datos protegidos. |
| Contexto actual | `AccessProvider` raíz mantiene sólo `{ accessToken, principalId, role, availability }` en estado React. `LoginForm` lo establece; `PasswordChangeForm` conserva el flujo restringido existente y, al terminar, vuelve a login. |
| Límite de sesión | No `localStorage`, `sessionStorage`, cookies, refresh, logout, BFF, Server Actions ni props serializadas con secreto. Una recarga, URL directa o 401 no restaura acceso: presenta login; borradores no sensibles sobreviven sólo en memoria durante la reautenticación. Este es el límite hasta priorizar el modelo de sesión. |
| Navegación | `RoleRouteGate` deriva menú y ruta inicial; si la ruta no pertenece al rol, muestra un único mensaje seguro y reemplaza por su inicio. `Link` navega; `useRouter` sólo realiza ese reemplazo con rutas internas constantes. Backend conserva la autorización definitiva. |

## Components and Interfaces

| Dominio/rutas | Componentes cliente y contratos |
|---|---|
| Acceso: `/` | `AccessProvider`, `RoleRouteGate`, `RoleNavigation`, `StatusRegion`; login/cambio existentes. Inicio: gestión para Admin/Secretario; instrucción de Enlace_QR para Empleado. |
| Administración: `/operaciones/{usuarios,sucursales,sucursales/[id]/empleados}` | listas, detalle/formulario y `AssignmentPanel`. Usa `users`, `branches`, `branches/:id/employees`, `users/:id/branch`. Secretario crea sólo Empleado, edita propio/Empleado y ve sucursales. |
| Cuestionarios: `/operaciones/cuestionarios/[id]/{versiones,asignaciones,qr}` | `QuestionnaireEditor`, `VersionEditor`, `QuestionBuilder`, `BranchAssignmentPanel`, `QrPanel`. Usa CRUD, versiones, publish, branches y QR existentes. |
| Empleado: `/scan/[qrToken]` | `ScanResolver`, `DynamicResponseForm`, `QuestionControl`, `UploadField`. Usa scan, responses y uploads/presign. |
| Reportes: `/operaciones/reportes/{pending,compliance,history}` | `ReportFilters`, `PaginatedResults`, `Pagination`. Estado local; filtros y páginas no se escriben en URL. |

`lib/operational-api/contracts.ts` declarará los DTO de API actuales: `UserDTO`, `BranchDTO`, `AssignmentDTO`, `QuestionnaireDTO`, `QuestionnaireVersionDTO`, `QuestionDTO`, `ResponseDTO`, `ScanResolutionDTO`, `QrDTO`, `PresignDTO`, `PendingReportDTO`, `ComplianceReportDTO` y `HistoryReportDTO`. `client.ts` aceptará el token sólo como argumento privado, agregará `Authorization: Bearer`, validará JSON como `unknown` antes de proyectar el DTO y devolverá `ProtectedResult<T>`.

## Data Models

`AccessContext` no incluye refresh token ni DTO de usuario renderizable. `OperationState` es `idle | pending | success | error`; se indexa por operación para bloquear doble activación. `ProtectedResult<T>` separa `success`, `unauthenticated`, `unavailable`, `conflict`, `validation(fieldIssues, generalIssue)` y `retryable`; nunca expone cuerpo, header, traza ni código interno.

`QuestionDraft` conserva `clientKey`, `order`, `type`, `prompt`, `required` y `config`; al guardar elimina `clientKey`, normaliza órdenes 1..n y envía el conjunto completo permitido por PATCH. `QuestionControl` despacha los 11 tipos a controles y produce `AnswerInput { questionId, type, value }`. Para `photo`/`file`, solicita `{questionnaireId,questionId,mimeType,sizeBytes}`, ejecuta PUT sólo a `uploadUrl` retornada sin Bearer, y guarda sólo `objectKey` como valor. `read_only` deshabilita controles, submit y presign.

Reportes construyen únicamente los query permitidos: pending (`businessDay`, `branchId`, `questionnaireId`); compliance (`from`, `to`, filtros, `page`, `pageSize`); history (más `employeeId`). La paginación proviene de `items,page,pageSize,total`; fechas reales y rango inclusivo máximo 31 días se validan antes del fetch.

## Correctness Properties

*Una propiedad describe un comportamiento que debe sostenerse para toda ejecución válida y conecta requisitos legibles con pruebas automatizadas.* PBT aplica a la lógica pura de rutas, serialización, errores, fechas y formularios; no a la red ni al PUT real.

**Reflexión:** se consolidan 3.6/4.7/5.8/6.7/7.3–7.8 en una propiedad de resultado; 3.7/7.6/7.8 en una de issues; 6.4/6.5 en rango de reporte.

### Property 1: Superficie autorizada
Para todo contexto y ruta, la UI sólo habilita superficie permitida; contexto inválido/restringido no habilita operaciones y una ruta inválida vuelve al inicio permitido.

**Validates: Requirements 1.1, 1.2, 1.3, 2.4**

### Property 2: Custodia del acceso
Para todo secreto y error interno, solicitudes protegidas lo usan sólo en Authorization y ninguna proyección de UI, URL, storage, mensaje o error lo contiene.

**Validates: Requirements 1.4, 7.4, 8.1, 8.2, 8.3**

### Property 3: Cuestionario consistente
Para todo conjunto válido de borradores, guardar conserva tipos/configuración, produce órdenes positivas únicas y un PATCH completo.

**Validates: Requirements 4.3**

### Property 4: Respuesta dinámica segura
Para toda pregunta válida, el control y `AnswerInput` respetan tipo/configuración; para todo scan `read_only`, ninguna mutación o carga queda activa.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5**

### Property 5: Consultas de reporte válidas
Para toda entrada, sólo fechas reales y rangos ≤31 días generan los parámetros permitidos; la paginación ofrece sólo páginas válidas.

**Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6**

### Property 6: Resultado de operación
Para toda secuencia de activaciones y respuesta, existe una solicitud pendiente por operación; conflicto, 422, 401, red o cuerpo inválido liberan la acción, preservan borrador no sensible y producen errores seguros asociados o un único estado general.

**Validates: Requirements 3.6, 3.7, 4.7, 5.7, 5.8, 6.7, 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.4**

### Property 7: Equivalencia de activación
Para todo valor válido, teclado y puntero invocan la misma operación y resultado observable.

**Validates: Requirements 9.6**

## Error Handling

200/201 actualiza DTO o recarga y anuncia éxito. 401 abre reautenticación sin refresh; 403/404 dicen “acceso/recurso no disponible”; 409 conserva borrador; 422 mapea sólo paths visibles y agrupa el resto; red/estado/cuerpo inesperado permite reintento. `StatusRegion` usa `role=status`/`aria-live`; errores usan `aria-invalid` y `aria-describedby`.

## Testing Strategy

| Capa | Cobertura |
|---|---|
| Unit (Vitest) | contratos, redacción, guard de una llamada, roles/rutas, fechas/paginación, normalización de preguntas y AnswerInput. |
| UI (RTL/jsdom) | flujos por rol, 11 controles, read-only, pending, errores asociados y nombres/estados ARIA. |
| PBT (`fast-check`) | Propiedades 1–7, mínimo 100 ejecuciones, una prueba por propiedad con comentario `Feature: operational-web-application, Property N: …`. |
| E2E (Playwright) | login→rol, CRUD simulado/entorno, QR editable/read-only, upload mockeado, reportes, Tab/Enter/click y 320/768/1024/1440 sin overflow. |

No se requiere migración ni rollout. Referencias locales: `node_modules/next/dist/docs/01-app/03-api-reference/{use-client,layout,page,dynamic-routes,error,loading}.md`, `.../data-security.md`, `.../testing/{vitest,playwright}.md`.