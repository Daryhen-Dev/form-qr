import { z } from 'zod'
import { cedulaSchema } from './auth.schema'

/**
 * Schema for POST /api/v1/users — creating a new user.
 * role is required at creation time; cedula follows the shared rule.
 * Note: passwordHash and passwordChangeRequired are NOT in this schema —
 * they are enforced by the service layer (cedula-as-initial-password, pcr=true).
 */
export const createUserSchema = z.object({
  nombres: z.string().min(1, { message: 'nombres is required' }),
  apellidos: z.string().min(1, { message: 'apellidos is required' }),
  cedula: cedulaSchema,
  role: z.enum(['Administrador', 'Secretario', 'Empleado'], {
    message: 'role must be one of Administrador, Secretario, Empleado',
  }),
})

/**
 * Schema for PATCH /api/v1/users/[id] — updating a user.
 * cedula and role are intentionally excluded (both are immutable after creation
 * in this slice — Design AD-7 for cedula uniqueness, AD-8 for role immutability).
 * All remaining fields are optional for partial updates.
 */
export const updateUserSchema = z.object({
  nombres: z.string().min(1).optional(),
  apellidos: z.string().min(1).optional(),
})
// Role and cedula are intentionally excluded — both are immutable after creation
// (Design AD-7 for cedula uniqueness, AD-8 for role immutability).
// Zod's default behavior strips unknown keys, so role/cedula passed in the
// payload will be absent from the parsed output, preventing accidental escalation.

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
