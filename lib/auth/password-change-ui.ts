export const PASSWORD_CHANGE_FIELD = {
  NEW_PASSWORD: 'newPassword',
  CONFIRM_PASSWORD: 'confirmPassword',
} as const

export type PasswordChangeField =
  (typeof PASSWORD_CHANGE_FIELD)[keyof typeof PASSWORD_CHANGE_FIELD]

export const PASSWORD_CHANGE_VALIDATION = {
  MIN_LENGTH: 8,
  MIN_LENGTH_ERROR: 'La nueva contraseña debe tener al menos 8 caracteres.',
  MISMATCH_ERROR: 'Las contraseñas no coinciden.',
} as const

export type PasswordChangeFieldErrors = Partial<Record<PasswordChangeField, string>>

export interface PasswordChangeFormState {
  newPassword: string
  confirmPassword: string
  fieldErrors: PasswordChangeFieldErrors
}

export function validateNewPassword(value: string): string | undefined {
  return value.length >= PASSWORD_CHANGE_VALIDATION.MIN_LENGTH
    ? undefined
    : PASSWORD_CHANGE_VALIDATION.MIN_LENGTH_ERROR
}

export function validateConfirmPassword(
  newPassword: string,
  confirmPassword: string
): string | undefined {
  return newPassword === confirmPassword
    ? undefined
    : PASSWORD_CHANGE_VALIDATION.MISMATCH_ERROR
}

export interface ChangePasswordRequestHeaders
  extends Record<string, string> {
  'Content-Type': 'application/json'
  Authorization: string
}

export interface ChangePasswordRequest extends RequestInit {
  method: 'POST'
  headers: ChangePasswordRequestHeaders
  body: string
}

export function buildChangePasswordRequest(
  accessToken: string,
  newPassword: string
): ChangePasswordRequest {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ newPassword }),
  }
}

export const PASSWORD_CHANGE_STATUS_MESSAGE = {
  IN_PROGRESS: 'Cambiando contraseña…',
  SUCCESS_LOGIN_REQUIRED: 'Contraseña actualizada. Inicie sesión con su nueva contraseña.',
  NEW_LOGIN_REQUIRED: 'Se requiere un nuevo inicio de sesión.',
  VALIDATION_ERROR: 'No fue posible validar la nueva contraseña.',
  RETRYABLE_FAILURE: 'No fue posible completar el cambio. Inténtelo nuevamente.',
} as const
