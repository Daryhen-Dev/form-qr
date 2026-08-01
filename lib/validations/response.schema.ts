/**
 * Zod schemas for the daily response API (Slice 5b).
 *
 * Structural validation only — discriminated union keyed on `type` mirrors
 * the 11 QuestionType values from Slice 4.
 *
 * Service-level config validation (option ids in range, scale bounds, required
 * presence, maxLength, key-prefix ownership) is intentionally deferred to
 * response.service.validateAnswersAgainstVersion — it requires the version
 * snapshot and cannot be expressed with pure Zod at the handler boundary.
 *
 * Uses Zod 4 conventions: `error:` param (not `message:`) where applicable.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Per-type answer schemas
// ---------------------------------------------------------------------------

/** Common questionId field shared by every arm. */
const questionIdField = z.string().min(1)

/**
 * Discriminated union for answer values keyed on `type`.
 * Each arm maps to one of the 11 QuestionType enum values.
 */
export const answerSchema = z.discriminatedUnion('type', [
  // boolean — true/false only; no coercion
  z.object({
    questionId: questionIdField,
    type: z.literal('boolean'),
    value: z.boolean(),
  }),

  // single_choice — selected option id (non-empty string)
  z.object({
    questionId: questionIdField,
    type: z.literal('single_choice'),
    value: z.string().min(1),
  }),

  // multiple_choice — at least one selected option id
  z.object({
    questionId: questionIdField,
    type: z.literal('multiple_choice'),
    value: z.array(z.string().min(1)).min(1),
  }),

  // scale — integer; bounds validated by service against question config
  z.object({
    questionId: questionIdField,
    type: z.literal('scale'),
    value: z.number().int(),
  }),

  // short_text — string (empty allowed structurally; service checks maxLength)
  z.object({
    questionId: questionIdField,
    type: z.literal('short_text'),
    value: z.string(),
  }),

  // long_text — string (empty allowed structurally; service checks maxLength)
  z.object({
    questionId: questionIdField,
    type: z.literal('long_text'),
    value: z.string(),
  }),

  // number — numeric value; bounds validated by service against question config
  z.object({
    questionId: questionIdField,
    type: z.literal('number'),
    value: z.number(),
  }),

  // date — ISO date string (format validated by service if needed)
  z.object({
    questionId: questionIdField,
    type: z.literal('date'),
    value: z.string().min(1),
  }),

  // time — HH:mm string (format validated by service if needed)
  z.object({
    questionId: questionIdField,
    type: z.literal('time'),
    value: z.string().min(1),
  }),

  // photo — server-issued object key (non-empty string; key-prefix ownership checked in 5d)
  z.object({
    questionId: questionIdField,
    type: z.literal('photo'),
    value: z.string().min(1),
  }),

  // file — server-issued object key (non-empty string; key-prefix ownership checked in 5d)
  z.object({
    questionId: questionIdField,
    type: z.literal('file'),
    value: z.string().min(1),
  }),
])

/** Inferred TypeScript type for a single validated answer. */
export type AnswerInput = z.infer<typeof answerSchema>

/** Schema for POST /api/v1/responses — create a new response. */
export const createResponseSchema = z.object({
  questionnaireId: z.string().min(1),
  answers: z.array(answerSchema),
})

/** Inferred TypeScript type for a create-response request body. */
export type CreateResponseInput = z.infer<typeof createResponseSchema>

/**
 * Schema for PATCH /api/v1/responses/[id] — update answers (Sub-PR 5c).
 * Declared here for completeness; the route is implemented in 5c.
 */
export const updateResponseSchema = z.object({
  answers: z.array(answerSchema),
})

/** Inferred TypeScript type for an update-response request body. */
export type UpdateResponseInput = z.infer<typeof updateResponseSchema>

/**
 * Schema for POST /api/v1/uploads/presign — request a presigned PUT URL (Sub-PR 5d).
 * Declared here for completeness; the route is implemented in 5d.
 */
export const presignSchema = z.object({
  questionnaireId: z.string().min(1),
  questionId: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
})

/** Inferred TypeScript type for a presign request body. */
export type PresignInput = z.infer<typeof presignSchema>
