import { z } from 'zod'

/**
 * Shared cédula validation rule.
 * Numeric string, 6–15 digits — covers cédula de ciudadanía and cédula de extranjería.
 * Design decision AD-6 / CF-01: max widened to 15 per business confirmation.
 */
export const cedulaSchema = z.string().regex(/^\d{6,15}$/, {
  message: 'cedula must be a numeric string between 6 and 15 digits',
})

/**
 * Schema for POST /api/v1/auth/login.
 * Validates cédula format and requires a non-empty password.
 */
export const loginSchema = z.object({
  cedula: cedulaSchema,
  password: z.string().min(1, { message: 'password is required' }),
})

/**
 * Schema for POST /api/v1/auth/change-password.
 * Requires a new password of at least 8 characters.
 */
export const changePasswordSchema = z.object({
  newPassword: z.string().min(8, {
    message: 'newPassword must be at least 8 characters',
  }),
})

/**
 * Schema for POST /api/v1/auth/refresh.
 * Requires a non-empty refresh token string.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, { message: 'refreshToken is required' }),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
