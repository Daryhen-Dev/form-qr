import 'server-only'
import { prisma } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of an answer row returned from the DB. */
export interface AnswerRow {
  id: string
  responseId: string
  questionId: string
  value: unknown
}

/** Input for creating a single answer row. */
export interface AnswerData {
  questionId: string
  value: unknown
}

/** Result of a batch insert. */
export interface BatchResult {
  count: number
}

// ---------------------------------------------------------------------------
// createManyForResponse
// ---------------------------------------------------------------------------

/**
 * Bulk-inserts answer rows for a given response in a single `createMany` call.
 *
 * Intended to be called WITHIN an outer Prisma $transaction (e.g., from
 * response.repository.createWithAnswers). Can also be called standalone when
 * the caller manages the transaction externally.
 *
 * @param responseId - The parent Response id.
 * @param answers    - Answer payloads to persist.
 * @returns { count } — number of rows inserted.
 */
export async function createManyForResponse(
  responseId: string,
  answers: AnswerData[]
): Promise<BatchResult> {
  return prisma.answer.createMany({
    data: answers.map((a) => ({
      responseId,
      questionId: a.questionId,
      value: a.value as never, // Prisma.InputJsonValue
    })),
  })
}

// ---------------------------------------------------------------------------
// findByResponse
// ---------------------------------------------------------------------------

/**
 * Returns all answers for a given response, ordered by questionId ascending.
 * Typically called when the caller already has the response id.
 *
 * @param responseId - The parent Response id.
 * @returns Array of AnswerRow objects (may be empty).
 */
export async function findByResponse(responseId: string): Promise<AnswerRow[]> {
  const rows = await prisma.answer.findMany({
    where: { responseId },
    orderBy: { questionId: 'asc' },
  })
  return rows as AnswerRow[]
}
