import { z } from 'zod'

// ---------------------------------------------------------------------------
// Option sub-schema — embedded in single_choice / multiple_choice
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
})

// ---------------------------------------------------------------------------
// Base fields shared by all question types
// ---------------------------------------------------------------------------

const baseFields = {
  order: z.number().int().positive(),
  prompt: z.string().min(1),
  required: z.boolean(),
}

// ---------------------------------------------------------------------------
// 11-type discriminated union on `type`
// Design #485 — Question-Type Discriminated Union section
// ---------------------------------------------------------------------------

/**
 * Full 11-type Zod discriminated union for question validation.
 *
 * Types:
 *  boolean          — no additional config (strict)
 *  single_choice    — options: Option[] (min 1)
 *  multiple_choice  — options: Option[] (min 1), minSelected?, maxSelected?
 *  scale            — min, max (max > min via refine), step?, labels?
 *  short_text       — maxLength?
 *  long_text        — maxLength?
 *  number           — min?, max?
 *  date             — no additional config (strict)
 *  time             — no additional config (strict)
 *  photo            — objectKeyPattern (required), maxSizeBytes?, allowedMimeTypes?
 *  file             — objectKeyPattern (required), maxSizeBytes?, allowedMimeTypes?
 */
export const questionSchema = z.discriminatedUnion('type', [
  // boolean — no config fields allowed (strict)
  z.object({
    ...baseFields,
    type: z.literal('boolean'),
    config: z.object({}).strict(),
  }),

  // single_choice — options required, at least 1
  z.object({
    ...baseFields,
    type: z.literal('single_choice'),
    config: z.object({
      options: z.array(optionSchema).min(1),
    }),
  }),

  // multiple_choice — options required, optional min/max selected
  z.object({
    ...baseFields,
    type: z.literal('multiple_choice'),
    config: z.object({
      options: z.array(optionSchema).min(1),
      minSelected: z.number().int().min(0).optional(),
      maxSelected: z.number().int().positive().optional(),
    }),
  }),

  // scale — min and max required; max must exceed min
  z.object({
    ...baseFields,
    type: z.literal('scale'),
    config: z
      .object({
        min: z.number().int(),
        max: z.number().int(),
        step: z.number().int().positive().optional(),
        labels: z.record(z.string(), z.string()).optional(),
      })
      .refine((c) => c.max > c.min, { error: 'max must exceed min' }),
  }),

  // short_text — optional maxLength
  z.object({
    ...baseFields,
    type: z.literal('short_text'),
    config: z.object({
      maxLength: z.number().int().positive().optional(),
    }),
  }),

  // long_text — optional maxLength
  z.object({
    ...baseFields,
    type: z.literal('long_text'),
    config: z.object({
      maxLength: z.number().int().positive().optional(),
    }),
  }),

  // number — optional min/max
  z.object({
    ...baseFields,
    type: z.literal('number'),
    config: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
    }),
  }),

  // date — no config fields allowed (strict)
  z.object({
    ...baseFields,
    type: z.literal('date'),
    config: z.object({}).strict(),
  }),

  // time — no config fields allowed (strict)
  z.object({
    ...baseFields,
    type: z.literal('time'),
    config: z.object({}).strict(),
  }),

  // photo — objectKeyPattern required; no BLOB stored (reference contract only)
  z.object({
    ...baseFields,
    type: z.literal('photo'),
    config: z.object({
      objectKeyPattern: z.string().min(1),
      maxSizeBytes: z.number().int().positive().optional(),
      allowedMimeTypes: z.array(z.string()).optional(),
    }),
  }),

  // file — objectKeyPattern required; no BLOB stored (reference contract only)
  z.object({
    ...baseFields,
    type: z.literal('file'),
    config: z.object({
      objectKeyPattern: z.string().min(1),
      maxSizeBytes: z.number().int().positive().optional(),
      allowedMimeTypes: z.array(z.string()).optional(),
    }),
  }),
])

// ---------------------------------------------------------------------------
// Batch schema — replace-all semantics with in-batch order uniqueness
// Design #485: superRefine enforces order uniqueness → 422
// ---------------------------------------------------------------------------

/**
 * Schema for PATCH /api/v1/questionnaires/[id]/versions/[versionId]
 * Sets the full ordered question set for a draft version.
 *
 * The superRefine enforces that no two questions in the same batch share the
 * same `order` value. Duplicate order → validation error with message
 * 'duplicate order' (→ 422 at the route handler boundary).
 */
export const setQuestionsSchema = z.object({
  questions: z.array(questionSchema).superRefine((qs, ctx) => {
    const seen = new Set<number>()
    qs.forEach((q, i) => {
      if (seen.has(q.order)) {
        ctx.addIssue({
          code: 'custom',
          message: 'duplicate order',
          path: [i, 'order'],
        })
      }
      seen.add(q.order)
    })
  }),
})

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type QuestionInput = z.infer<typeof questionSchema>
export type SetQuestionsInput = z.infer<typeof setQuestionsSchema>
