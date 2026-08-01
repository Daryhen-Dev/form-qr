import { z } from 'zod'

/**
 * Schema for POST /api/v1/branches/[id]/employees — assigning an employee to a branch.
 * userId is required and must be non-empty.
 *
 * Note: cedulaSchema is not used here because assignments are identified by userId
 * (the internal DB id), not by cédula. The cedulaSchema is reused in auth/user schemas
 * where cédula-based lookup is needed.
 */
export const assignSchema = z.object({
  userId: z.string().min(1, { error: 'userId is required' }),
})

export type AssignInput = z.infer<typeof assignSchema>
