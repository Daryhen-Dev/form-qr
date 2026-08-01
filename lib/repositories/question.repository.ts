import 'server-only'
import { prisma } from '@/lib/db'
import type { QuestionType } from '@/lib/types'

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
 * Deletes existing questions and recreates them from the provided input.
 *
 * NOTE: This is a stub in Sub-PR 4a. Full implementation (with proper input typing
 * and immutability enforcement) is wired in Sub-PR 4b.
 * Callers in 4b MUST assert draft status before invoking this function.
 *
 * @throws {Error} NOT_IMPLEMENTED — wired in 4b
 */
export async function replaceForVersion(
  _versionId: string,
  _questions: unknown[]
): Promise<QuestionRow[]> {
  throw new Error('NOT_IMPLEMENTED: replaceForVersion is wired in Sub-PR 4b')
}
