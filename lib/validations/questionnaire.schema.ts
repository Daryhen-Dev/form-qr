import { z } from 'zod'

/**
 * Schema for POST /api/v1/questionnaires — creating a new template.
 * title is required and must be non-empty.
 * description is optional.
 */
export const createQuestionnaireSchema = z.object({
  title: z.string().min(1, { error: 'title is required' }),
  description: z.string().optional(),
})

/**
 * Schema for PATCH /api/v1/questionnaires/[id] — updating a template.
 * All fields are optional for partial updates.
 */
export const updateQuestionnaireSchema = createQuestionnaireSchema.partial()

/**
 * Schema for POST /api/v1/questionnaires/[id]/versions — creating a new version.
 * No body fields are required; the server derives versionNumber automatically.
 */
export const createVersionSchema = z.object({}).strict()

export type CreateQuestionnaireInput = z.infer<typeof createQuestionnaireSchema>
export type UpdateQuestionnaireInput = z.infer<typeof updateQuestionnaireSchema>
export type CreateVersionInput = z.infer<typeof createVersionSchema>
