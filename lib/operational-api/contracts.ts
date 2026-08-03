import type { QuestionType, Role } from '@/lib/types'

export type {
  AnswerDTO,
  AssignmentDTO,
  BranchDTO,
  ComplianceDetailDTO,
  ComplianceReportDTO,
  ComplianceSummaryDTO,
  EmployeeBranchViewDTO,
  EnrichedAnswerDTO,
  HistoryEntryDTO,
  HistoryReportDTO,
  Paginated,
  PendingEntryDTO,
  PendingReportDTO,
  PresignDTO,
  QuestionDTO,
  QuestionnaireBranchDTO,
  QuestionnaireDTO,
  QuestionnaireVersionDTO,
  QrDTO,
  ResponseDTO,
  ScanResolutionDTO,
  UserDTO,
} from '@/lib/types'

export const OPERATIONAL_API_PREFIX = '/api/v1' as const

export const PROTECTED_RESULT_KIND = {
  SUCCESS: 'success',
  UNAUTHENTICATED: 'unauthenticated',
  UNAVAILABLE: 'unavailable',
  CONFLICT: 'conflict',
  VALIDATION: 'validation',
  RETRYABLE: 'retryable',
} as const

export type ProtectedResultKind =
  (typeof PROTECTED_RESULT_KIND)[keyof typeof PROTECTED_RESULT_KIND]

export const SAFE_STATUS_MESSAGE = {
  SUCCESS: 'Operación completada.',
  UNAUTHENTICATED: 'Tu sesión no está disponible. Volvé a iniciar sesión.',
  UNAVAILABLE: 'El acceso o recurso no está disponible.',
  CONFLICT: 'Los datos cambiaron. Revisá la información e intentá nuevamente.',
  VALIDATION: 'Revisá los campos marcados e intentá nuevamente.',
  RETRYABLE: 'No se pudo completar la operación. Intentá nuevamente.',
  FIELD_ISSUE: 'Revisá este campo.',
} as const

export interface CreateUserRequest {
  nombres: string
  apellidos: string
  cedula: string
  role: Role
}

export interface UpdateUserRequest {
  nombres?: string
  apellidos?: string
}

export interface CreateBranchRequest {
  name: string
  code?: string
  address?: string
}

export type UpdateBranchRequest = CreateBranchRequest

export interface AssignEmployeeRequest {
  userId: string
}

export interface CreateQuestionnaireRequest {
  title: string
  description?: string
}

export type UpdateQuestionnaireRequest = CreateQuestionnaireRequest

export interface QuestionInput {
  order: number
  type: QuestionType
  prompt: string
  required: boolean
  config: Record<string, unknown>
}

export interface SetQuestionsRequest {
  questions: QuestionInput[]
}

export interface AssignQuestionnaireBranchRequest {
  branchId: string
}

export interface BooleanAnswerInput {
  questionId: string
  type: 'boolean'
  value: boolean
}

export interface SingleChoiceAnswerInput {
  questionId: string
  type: 'single_choice'
  value: string
}

export interface MultipleChoiceAnswerInput {
  questionId: string
  type: 'multiple_choice'
  value: string[]
}

export interface NumericAnswerInput {
  questionId: string
  type: 'scale' | 'number'
  value: number
}

export interface TextAnswerInput {
  questionId: string
  type: 'short_text' | 'long_text' | 'date' | 'time' | 'photo' | 'file'
  value: string
}

export type AnswerInput =
  | BooleanAnswerInput
  | SingleChoiceAnswerInput
  | MultipleChoiceAnswerInput
  | NumericAnswerInput
  | TextAnswerInput

export interface CreateResponseRequest {
  questionnaireId: string
  answers: AnswerInput[]
}

export interface UpdateResponseRequest {
  answers: AnswerInput[]
}

export interface PresignRequest {
  questionnaireId: string
  questionId: string
  mimeType: string
  sizeBytes: number
}

export interface FieldIssue {
  readonly field: string
  readonly message: string
}

export interface ProtectedSuccess<T> {
  readonly kind: typeof PROTECTED_RESULT_KIND.SUCCESS
  readonly data: T
}

export interface ProtectedUnauthenticated {
  readonly kind: typeof PROTECTED_RESULT_KIND.UNAUTHENTICATED
}

export interface ProtectedUnavailable {
  readonly kind: typeof PROTECTED_RESULT_KIND.UNAVAILABLE
}

export interface ProtectedConflict {
  readonly kind: typeof PROTECTED_RESULT_KIND.CONFLICT
}

export interface ProtectedValidation {
  readonly kind: typeof PROTECTED_RESULT_KIND.VALIDATION
  readonly fieldIssues: readonly FieldIssue[]
  readonly generalIssue: string | null
}

export interface ProtectedRetryable {
  readonly kind: typeof PROTECTED_RESULT_KIND.RETRYABLE
}

export type ProtectedResult<T> =
  | ProtectedSuccess<T>
  | ProtectedUnauthenticated
  | ProtectedUnavailable
  | ProtectedConflict
  | ProtectedValidation
  | ProtectedRetryable

export function safeSuccess<T>(data: T): ProtectedSuccess<T> {
  return { kind: PROTECTED_RESULT_KIND.SUCCESS, data }
}

export function unauthenticatedResult(): ProtectedUnauthenticated {
  return { kind: PROTECTED_RESULT_KIND.UNAUTHENTICATED }
}

export function unavailableResult(): ProtectedUnavailable {
  return { kind: PROTECTED_RESULT_KIND.UNAVAILABLE }
}

export function conflictResult(): ProtectedConflict {
  return { kind: PROTECTED_RESULT_KIND.CONFLICT }
}

export function retryableResult(): ProtectedRetryable {
  return { kind: PROTECTED_RESULT_KIND.RETRYABLE }
}

export function createValidationResult(
  visibleFieldNames: readonly string[],
  hasUnassociatedIssue: boolean
): ProtectedValidation {
  const fieldIssues = Array.from(
    new Set(
      visibleFieldNames.filter((field) => /^[a-z][a-zA-Z0-9_-]*$/.test(field))
    )
  ).map((field) => ({ field, message: SAFE_STATUS_MESSAGE.FIELD_ISSUE }))

  return {
    kind: PROTECTED_RESULT_KIND.VALIDATION,
    fieldIssues,
    generalIssue:
      hasUnassociatedIssue || fieldIssues.length === 0
        ? SAFE_STATUS_MESSAGE.VALIDATION
        : null,
  }
}

export function clearValidationFieldIssue(
  result: ProtectedValidation,
  field: string
): ProtectedValidation {
  return {
    ...result,
    fieldIssues: result.fieldIssues.filter((issue) => issue.field !== field),
  }
}

export function redactFailure(
  kind: Exclude<ProtectedResultKind, typeof PROTECTED_RESULT_KIND.SUCCESS>,
  details?: unknown
): string {
  void details

  switch (kind) {
    case PROTECTED_RESULT_KIND.UNAUTHENTICATED:
      return SAFE_STATUS_MESSAGE.UNAUTHENTICATED
    case PROTECTED_RESULT_KIND.UNAVAILABLE:
      return SAFE_STATUS_MESSAGE.UNAVAILABLE
    case PROTECTED_RESULT_KIND.CONFLICT:
      return SAFE_STATUS_MESSAGE.CONFLICT
    case PROTECTED_RESULT_KIND.VALIDATION:
      return SAFE_STATUS_MESSAGE.VALIDATION
    case PROTECTED_RESULT_KIND.RETRYABLE:
      return SAFE_STATUS_MESSAGE.RETRYABLE
  }
}

export function isProtectedSuccess<T>(
  result: ProtectedResult<T>
): result is ProtectedSuccess<T> {
  return result.kind === PROTECTED_RESULT_KIND.SUCCESS
}
