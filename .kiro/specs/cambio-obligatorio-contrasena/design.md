# Technical Design: Cambio Obligatorio de Contraseña

## Overview

Este diseño implementa la interfaz para el cambio obligatorio de contraseña cuando `POST /api/v1/auth/login` devuelve `passwordChangeRequired: true`. El flujo parte del resultado de login restringido y presenta un formulario de cambio que consume el endpoint existente `POST /api/v1/auth/change-password`.

**Objetivo principal:** Permitir a la persona usuaria completar el cambio obligatorio de contraseña de forma accesible y segura, sin persistir tokens ni habilitar sesión autenticada.

## Architecture

**Decisión adoptada: Componente hijo (`PasswordChangeForm`)**. Separación de responsabilidades, testeo unitario aislado, paso de `accessToken` como prop exclusivamente para el header `Authorization`.

- Validación local: solo longitud mínima 8 caracteres y coincidencia exacta
- Secretos solo en estado React (useState), sin persistencia

## Components and Interfaces

```
LoginForm
├── Estado: credentials, fieldErrors, isPending, statusMessage
├── Estado compartido (setRestrictedSession):
│   └── restrictedSession: { accessToken, user, availability: 'restricted' }
└── Renderizado condicional:
    ├── Si !restrictedSession → formulario de login
    └── Si restrictedSession → <PasswordChangeForm accessToken={...} onComplete={...} />

PasswordChangeForm (componente hijo)
├── Props: accessToken (string), onComplete () => void
├── Estado local: newPassword, confirmPassword, fieldErrors, isPending, statusMessage
├── Validación en tiempo real (onChange)
└── Submit: POST /api/v1/auth/change-password
```

### Archivos a Crear/Modificar

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| Crear | `components/auth/password-change-form.tsx` | Componente hijo con el formulario de cambio |
| Crear | `lib/auth/password-change-ui.ts` | Lógica de validación, mensajes y construcción de request |
| Modificar | `components/auth/login-form.tsx` | Añadir estado `restrictedSession`, renderizado condicional |

## Data Models

```typescript
// lib/auth/password-change-ui.ts

export const PASSWORD_CHANGE_FIELD = {
  NEW_PASSWORD: 'newPassword',
  CONFIRM_PASSWORD: 'confirmPassword',
} as const

export type PasswordChangeField = typeof PASSWORD_CHANGE_FIELD[keyof typeof PASSWORD_CHANGE_FIELD]

export const PASSWORD_CHANGE_VALIDATION = {
  MIN_LENGTH: 8,
  MIN_LENGTH_ERROR: 'La nueva contraseña debe tener al menos 8 caracteres.',
  MISMATCH_ERROR: 'Las contraseñas no coinciden.',
} as const

export interface PasswordChangeFormState {
  newPassword: string
  confirmPassword: string
  fieldErrors: Partial<Record<PasswordChangeField, string>>
}

export function validateNewPassword(value: string): string | undefined

export function validateConfirmPassword(
  newPassword: string,
  confirmPassword: string
): string | undefined

export interface ChangePasswordRequest {
  method: 'POST'
  headers: {
    'Content-Type': 'application/json'
    Authorization: string
  }
  body: string
}

export function buildChangePasswordRequest(
  accessToken: string,
  newPassword: string
): ChangePasswordRequest

export const PASSWORD_CHANGE_STATUS_MESSAGE = {
  IN_PROGRESS: 'Cambiando contraseña…',
  SUCCESS_LOGIN_REQUIRED: 'Contraseña actualizada. Inicie sesión con su nueva contraseña.',
  NEW_LOGIN_REQUIRED: 'Se requiere un nuevo inicio de sesión.',
  VALIDATION_ERROR: 'No fue posible validar la nueva contraseña.',
  RETRYABLE_FAILURE: 'No fue posible completar el cambio. Inténtelo nuevamente.',
} as const
```

## Error Handling

| Código HTTP | Condición | Acción |
|-------------|-----------|--------|
| 200 | `{ success: true }` exacto | Eliminar inmediatamente `accessToken` y valores de ambos inputs. Llamar a `onComplete()` que limpia `restrictedSession` y vuelve al formulario de login existente. Mostrar mensaje de éxito "Contraseña actualizada. Inicie sesión con su nueva contraseña." Sin espera, sin panel, sin sesión restaurada. |
| 401 | cualquiera | Eliminar `accessToken`, limpiar `restrictedSession`, volver al login. Mostrar mensaje "Se requiere un nuevo inicio de sesión." |
| 422 | `issues` con `path[0] === 'newPassword'` | Conservar `accessToken` para reintento. Limpiar ambos campos de contraseña antes de habilitar nuevo envío. Mostrar error de campo "No fue posible validar la nueva contraseña." |
| 422 | otro caso | Conservar `accessToken` para reintento. Limpiar ambos campos de contraseña antes de habilitar nuevo envío. Mostrar mensaje retryable "No fue posible completar el cambio. Inténtelo nuevamente." |
| Red, JSON inválido, estado inesperado | — | Conservar `accessToken` para reintento. Limpiar ambos campos de contraseña antes de habilitar nuevo envío. Mostrar mensaje retryable "No fue posible completar el cambio. Inténtelo nuevamente." |
| 200 | cuerpo distinto de `{ success: true }` | Tratar como retryable. Conservar `accessToken`, limpiar inputs, permitir reintento. |

## Testing Strategy

**Archivos de prueba previstos:**
- Unitario: `lib/auth/password-change-ui.unit.test.ts`
- UI: `components/auth/password-change-form.ui.test.tsx`
- UI: `components/auth/login-form.ui.test.tsx` (modificación)
- E2E: `tests/e2e/password-change-required.spec.ts`

## Correctness Properties

### Property 1: No-exposición de secretos
**Validates: Requirements 4.1, 4.2, 4.6, 4.11**

Ningún secreto aparece en DOM, URL, storage, logs ni mensajes. Verificar inspectando el DOM tras cada interacción.

### Property 2: Transición correcta de modo restringido a login
**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**

Tras 200 con `{ success: true }`: eliminar token, limpiar inputs, volver al login con mensaje de éxito, sin panel ni sesión. Tras error: conservar token para reintento, limpiar inputs, habilitar nuevo envío.

### Property 3: Request mínimo autenticado
**Validates: Requirements 3.1, 3.2, 3.3**

Request POST a `/api/v1/auth/change-password` con headers `Content-Type: application/json` y `Authorization: Bearer <token>`, cuerpo `{ "newPassword": "..." }`.

### Property 4: Equivalencia de interacción teclado/puntero
**Validates: Requirements 5.1, 5.2, 5.3**

Clic, Enter y Espacio producen idénticos resultados de validación y estado.

### Property 5: Accesibilidad completa
**Validates: Requirements 1.1, 1.2, 1.3, 2.6, 5.1, 5.2**

Inputs con etiquetas, `aria-invalid`, errores asociados via `aria-describedby`, mensajes con `aria-live`, foco inicial en "Nueva contraseña", navegación por Tab en orden visual.

## Threat Matrix: N/A

Esta funcionalidad no afecta routing, shell, procesos, VCS ni clasificación de ejecutables. No aplica superficie de ataque adicional.

## Risks

No hay riesgos arquitectónicos identificados. Las decisiones técnicas respetan los requisitos aprobados y las convenciones existentes del proyecto.