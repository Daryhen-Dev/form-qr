import { z } from 'zod'

/**
 * Schema for POST /api/v1/questionnaires/[id]/branches — assigning a template to a branch.
 * branchId is required and must be non-empty.
 */
export const assignBranchSchema = z.object({
  branchId: z.string().min(1, { error: 'branchId is required' }),
})

export type AssignBranchInput = z.infer<typeof assignBranchSchema>
