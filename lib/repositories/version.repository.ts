import 'server-only'
import { prisma } from '@/lib/db'
import type { VersionStatus } from '@/lib/types'

/** Shape of a version row as returned from the DB (without questions). */
export interface VersionRow {
  id: string
  questionnaireId: string
  versionNumber: number
  status: VersionStatus
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** Shape of a question row as returned from the DB (for clone operations). */
interface QuestionRowForClone {
  versionId: string
  order: number
  type: string
  prompt: string
  required: boolean
  config: unknown
}

/**
 * Creates a new draft version for a questionnaire.
 * versionNumber must be provided (callers use nextVersionNumber first).
 */
export async function createDraft(
  questionnaireId: string,
  versionNumber: number
): Promise<VersionRow> {
  return prisma.questionnaireVersion.create({
    data: {
      questionnaireId,
      versionNumber,
      status: 'draft',
    },
  }) as Promise<VersionRow>
}

/**
 * Finds a version by ID regardless of questionnaire.
 * Returns null if not found.
 */
export async function findById(id: string): Promise<VersionRow | null> {
  return prisma.questionnaireVersion.findUnique({
    where: { id },
  }) as Promise<VersionRow | null>
}

/**
 * Lists all versions for a questionnaire ordered by versionNumber ascending.
 */
export async function listByQuestionnaire(questionnaireId: string): Promise<VersionRow[]> {
  return prisma.questionnaireVersion.findMany({
    where: { questionnaireId },
    orderBy: { versionNumber: 'asc' },
  }) as Promise<VersionRow[]>
}

/**
 * Returns the next sequential version number for a questionnaire.
 * Returns 1 if no versions exist yet.
 */
export async function nextVersionNumber(questionnaireId: string): Promise<number> {
  const latest = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })
  return (latest?.versionNumber ?? 0) + 1
}

/**
 * Publishes a version by setting status=published and publishedAt=now().
 * Caller MUST assert the version is currently draft before calling.
 */
export async function publish(id: string): Promise<VersionRow> {
  return prisma.questionnaireVersion.update({
    where: { id },
    data: {
      status: 'published',
      publishedAt: new Date(),
    },
  }) as Promise<VersionRow>
}

/**
 * Clones a published version into a new draft, copying all questions with fresh cuids.
 * Uses a $transaction to ensure atomicity.
 * The new draft gets the next sequential versionNumber.
 *
 * Returns the newly created draft version row.
 */
export async function cloneFrom(sourceVersionId: string): Promise<VersionRow> {
  return prisma.$transaction(async (tx) => {
    // Fetch the source version
    const source = await tx.questionnaireVersion.findUniqueOrThrow({
      where: { id: sourceVersionId },
      include: { questions: { orderBy: { order: 'asc' } } },
    })

    // Compute the next version number
    const latest = await tx.questionnaireVersion.findFirst({
      where: { questionnaireId: source.questionnaireId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    })
    const newVersionNumber = (latest?.versionNumber ?? 0) + 1

    // Create the new draft version
    const newVersion = await tx.questionnaireVersion.create({
      data: {
        questionnaireId: source.questionnaireId,
        versionNumber: newVersionNumber,
        status: 'draft',
      },
    })

    // Clone questions with fresh ids (createMany does not support cuid generation —
    // use create in a loop so each gets a new @default(cuid()) id)
    for (const q of source.questions as QuestionRowForClone[]) {
      await tx.question.create({
        data: {
          versionId: newVersion.id,
          order: q.order,
          type: q.type as never, // QuestionType enum — value is already a valid enum string
          prompt: q.prompt,
          required: q.required,
          config: q.config as never, // Prisma.InputJsonValue
        },
      })
    }

    return newVersion as VersionRow
  })
}
