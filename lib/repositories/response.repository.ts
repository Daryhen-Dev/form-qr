import 'server-only'
import { prisma } from '@/lib/db'
import { ServiceError } from '@/lib/services/auth.service'

// ---------------------------------------------------------------------------
// Data transfer types
// ---------------------------------------------------------------------------

/** Shape of a response row as returned from the DB (without answers). */
export interface ResponseRow {
  id: string
  questionnaireId: string
  versionId: string
  userId: string
  businessDay: Date
  createdAt: Date
  submittedAt: Date | null
  updatedAt: Date
  deletedAt: Date | null
}

/** Shape of a response row with its answers included. */
export interface ResponseWithAnswers extends ResponseRow {
  answers: AnswerRow[]
}

/** Shape of an answer row as returned from the DB. */
export interface AnswerRow {
  id: string
  responseId: string
  questionId: string
  value: unknown
}

/** Input data for creating a new response. */
export interface CreateResponseData {
  questionnaireId: string
  versionId: string
  userId: string
  /** Local calendar date in America/Guayaquil, stored as @db.Date. */
  businessDay: Date
}

/** Input data for a single answer to be created alongside a response. */
export interface AnswerData {
  questionId: string
  value: unknown
}

// ---------------------------------------------------------------------------
// createWithAnswers
// ---------------------------------------------------------------------------

/**
 * Atomically creates a Response row and all associated Answer rows in a single
 * Prisma $transaction.
 *
 * Maps Prisma error P2002 on the compound unique `(userId, questionnaireId,
 * businessDay)` to a typed ServiceError(409, 'response_exists'), which the
 * service layer surfaces as a 409 HTTP response.
 *
 * @param data    - Core response fields.
 * @param answers - Answer payloads to persist in the same transaction.
 * @returns The newly created ResponseRow.
 * @throws ServiceError(409, 'response_exists') on duplicate same-day response.
 */
export async function createWithAnswers(
  data: CreateResponseData,
  answers: AnswerData[]
): Promise<ResponseRow> {
  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Create the Response row
      const response = await tx.response.create({
        data: {
          questionnaireId: data.questionnaireId,
          versionId: data.versionId,
          userId: data.userId,
          businessDay: data.businessDay,
        },
      })

      // 2. Bulk-create all Answer rows for this response (batch insert)
      if (answers.length > 0) {
        await tx.answer.createMany({
          data: answers.map((a) => ({
            responseId: response.id,
            questionId: a.questionId,
            value: a.value as never, // Prisma.InputJsonValue
          })),
        })
      }

      return response as ResponseRow
    })
  } catch (err) {
    // Map Prisma unique constraint violation on businessDay compound unique → 409
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      throw new ServiceError(409, 'response_exists')
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// findByUserQuestionnaireDay
// ---------------------------------------------------------------------------

/**
 * Finds an active response for a specific (user, questionnaire, businessDay) tuple.
 * Returns null if no response exists for that combination.
 * Soft-deleted responses are excluded.
 *
 * Used by response.service.create to check for duplicates and by scan.service
 * to determine today's response status (absent / editable / read_only).
 */
export async function findByUserQuestionnaireDay(
  userId: string,
  questionnaireId: string,
  businessDay: Date
): Promise<ResponseWithAnswers | null> {
  const row = await prisma.response.findFirst({
    where: {
      userId,
      questionnaireId,
      businessDay,
      deletedAt: null,
    },
    include: { answers: true },
  })
  return row as ResponseWithAnswers | null
}

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------

/**
 * Finds an active response by id, including its answers.
 * Returns null if not found or soft-deleted.
 *
 * @param id - The response's cuid.
 */
export async function findById(id: string): Promise<ResponseWithAnswers | null> {
  const row = await prisma.response.findFirst({
    where: { id, deletedAt: null },
    include: { answers: true },
  })
  return row as ResponseWithAnswers | null
}
