import { z } from 'zod'

/**
 * Shared cédula validation rule.
 * Colombian cédula de ciudadanía: numeric string, 6–10 digits.
 * Design decision AD-6: 6–10 (may widen to 12 if extranjería IDs are confirmed in-scope).
 */
export const cedulaSchema = z.string().regex(/^\d{6,10}$/, {
  message: 'cedula must be a numeric string between 6 and 10 digits',
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
