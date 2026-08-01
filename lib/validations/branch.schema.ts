import { z } from 'zod'

/**
 * Schema for POST /api/v1/branches — creating a new branch.
 * name is required and must be non-empty.
 * code and address are optional fields.
 */
export const createBranchSchema = z.object({
  name: z.string().min(1, { error: 'name is required' }),
  code: z.string().optional(),
  address: z.string().optional(),
})

/**
 * Schema for PATCH /api/v1/branches/[id] — updating a branch.
 * All fields are optional for partial updates (partial of createBranchSchema).
 */
export const updateBranchSchema = createBranchSchema.partial()

export type CreateBranchInput = z.infer<typeof createBranchSchema>
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>
