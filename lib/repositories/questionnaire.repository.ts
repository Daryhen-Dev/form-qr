import 'server-only'
import { prisma } from '@/lib/db'

/** Shape of a questionnaire row as returned from the DB. */
export interface QuestionnaireRow {
  id: string
  title: string
  description: string | null
  currentVersionId: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/** Shape of data used to create a new questionnaire row. */
export interface CreateQuestionnaireData {
  title: string
  description?: string
}

/** Shape of data used to update an existing questionnaire row (all fields optional). */
export interface UpdateQuestionnaireData {
  title?: string
  description?: string
}

/**
 * Creates a new questionnaire template row.
 */
export async function create(data: CreateQuestionnaireData): Promise<QuestionnaireRow> {
  return prisma.questionnaire.create({
    data: {
      title: data.title,
      description: data.description ?? null,
    },
  }) as Promise<QuestionnaireRow>
}

/**
 * Finds an active (non-deleted) questionnaire by ID.
 * Returns null if not found or soft-deleted.
 */
export async function findById(id: string): Promise<QuestionnaireRow | null> {
  return prisma.questionnaire.findFirst({
    where: { id, deletedAt: null },
  }) as Promise<QuestionnaireRow | null>
}

/**
 * Returns all active (non-deleted) questionnaires ordered by createdAt ascending.
 * Soft-deleted questionnaires are excluded by the default filter.
 */
export async function findAll(): Promise<QuestionnaireRow[]> {
  return prisma.questionnaire.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  }) as Promise<QuestionnaireRow[]>
}

/**
 * Updates allowed fields on an existing questionnaire row.
 * Caller MUST ensure the id refers to an active questionnaire.
 */
export async function update(id: string, data: UpdateQuestionnaireData): Promise<QuestionnaireRow> {
  return prisma.questionnaire.update({
    where: { id },
    data,
  }) as Promise<QuestionnaireRow>
}

/**
 * Soft-deletes a questionnaire by setting deletedAt to the current UTC timestamp.
 * Hard-delete is intentionally NOT exported from this module (spec requirement).
 */
export async function softDelete(id: string): Promise<QuestionnaireRow> {
  return prisma.questionnaire.update({
    where: { id },
    data: { deletedAt: new Date() },
  }) as Promise<QuestionnaireRow>
}

/**
 * Sets the currentVersionId pointer on a questionnaire template.
 * Pass null to clear the pointer (e.g., on template soft-delete).
 * Caller MUST ensure the version belongs to this questionnaire.
 */
export async function setCurrentVersion(
  id: string,
  versionId: string | null
): Promise<QuestionnaireRow> {
  return prisma.questionnaire.update({
    where: { id },
    data: { currentVersionId: versionId },
  }) as Promise<QuestionnaireRow>
}

// NOTE: Hard-delete is intentionally absent. Exporting a hard-delete function
// would violate the spec requirement that deletion is soft-only.
