import 'server-only'
import { prisma } from '@/lib/db'
import type { QuestionType } from '@/lib/types'
import type { QuestionInput } from '@/lib/validations/question.schema'

/** Shape of a question row as returned from the DB. */
export interface QuestionRow {
  id: string
  versionId: string
  order: number
  type: QuestionType
  prompt: string
  required: boolean
  config: Record<string, unknown>
}

/**
 * Returns all questions for a version, ordered ascending by `order`.
 */
export async function findByVersion(versionId: string): Promise<QuestionRow[]> {
  const rows = await prisma.question.findMany({
    where: { versionId },
    orderBy: { order: 'asc' },
  })
  return rows.map((r) => ({
    id: r.id,
    versionId: r.versionId,
    order: r.order,
    type: r.type as QuestionType,
    prompt: r.prompt,
    required: r.required,
    config: r.config as Record<string, unknown>,
  }))
}

/**
 * Replaces all questions for a draft version in a single atomic transaction.
 *
 * Deletes all existing questions for the version and recreates them from the
 * provided input array. This is a full replace (not merge/patch).
 *
 * The caller (questionnaire.service.setVersionQuestions) is responsible for
 * asserting draft status BEFORE calling this function. This repository function
 * performs no immutability check — it blindly replaces.
 *
 * Wrapped in a Prisma $transaction for atomicity.
 *
 * @param versionId  - The version whose questions are replaced.
 * @param questions  - Validated question inputs from setQuestionsSchema.
 * @returns The newly created question rows ordered by `order` ascending.
 */
export async function replaceForVersion(
  versionId: string,
  questions: QuestionInput[]
): Promise<QuestionRow[]> {
  return prisma.$transaction(async (tx) => {
    // 1. Delete all existing questions for this version
    await tx.question.deleteMany({ where: { versionId } })

    // 2. Recreate questions from the provided input (empty batch is valid)
    if (questions.length > 0) {
      await tx.question.createMany({
        data: questions.map((q) => ({
          versionId,
          order: q.order,
          type: q.type,
          prompt: q.prompt,
          required: q.required,
          config: q.config,
        })),
      })
    }

    // 3. Return newly created rows ordered by `order` ascending
    const rows = await tx.question.findMany({
      where: { versionId },
      orderBy: { order: 'asc' },
    })

    return rows.map((r) => ({
      id: r.id,
      versionId: r.versionId,
      order: r.order,
      type: r.type as QuestionType,
      prompt: r.prompt,
      required: r.required,
      config: r.config as Record<string, unknown>,
    }))
  })
}
