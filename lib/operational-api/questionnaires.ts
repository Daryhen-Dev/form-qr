import { HTTP_METHOD, requestProtected } from '@/lib/operational-api/client'
import type {
  AssignQuestionnaireBranchRequest,
  CreateQuestionnaireRequest,
  ProtectedResult,
  QrDTO,
  QuestionDTO,
  QuestionnaireBranchDTO,
  QuestionnaireDTO,
  QuestionnaireVersionDTO,
  SetQuestionsRequest,
  UpdateQuestionnaireRequest,
} from '@/lib/operational-api/contracts'

/** Version payload that includes its ordered questions (GET/PATCH version). */
export type QuestionnaireVersionWithQuestions = QuestionnaireVersionDTO & {
  readonly questions: QuestionDTO[]
}

/** Result of a delete/unassign operation that returns `{ success: true }`. */
export interface OperationAck {
  readonly success: true
}

const QUESTIONNAIRE_FIELD_NAMES = ['title', 'description'] as const
const ASSIGN_BRANCH_FIELD_NAMES = ['branchId'] as const
const QUESTIONS_FIELD_NAMES = ['questions'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pick<T>(payload: unknown, key: string): T | undefined {
  return isRecord(payload) ? (payload[key] as T) : undefined
}

function pickArray<T>(payload: unknown, key: string): T[] | undefined {
  const value = pick<unknown>(payload, key)
  return Array.isArray(value) ? (value as T[]) : undefined
}

function projectAck(payload: unknown): OperationAck | undefined {
  return isRecord(payload) && payload.success === true
    ? { success: true }
    : undefined
}

function encode(segment: string): string {
  return encodeURIComponent(segment)
}

function jsonBody(body: unknown): string {
  return JSON.stringify(body)
}

// --- Questionnaire CRUD -----------------------------------------------------

export function listQuestionnaires(
  accessToken: string
): Promise<ProtectedResult<QuestionnaireDTO[]>> {
  return requestProtected<QuestionnaireDTO[]>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: '/questionnaires',
    project: (payload) => pickArray<QuestionnaireDTO>(payload, 'questionnaires'),
  })
}

export function createQuestionnaire(
  accessToken: string,
  body: CreateQuestionnaireRequest
): Promise<ProtectedResult<QuestionnaireDTO>> {
  return requestProtected<QuestionnaireDTO>({
    accessToken,
    method: HTTP_METHOD.POST,
    path: '/questionnaires',
    body: jsonBody(body),
    project: (payload) => pick<QuestionnaireDTO>(payload, 'questionnaire'),
    visibleFieldNames: QUESTIONNAIRE_FIELD_NAMES,
  })
}

export function getQuestionnaire(
  accessToken: string,
  id: string
): Promise<ProtectedResult<QuestionnaireDTO>> {
  return requestProtected<QuestionnaireDTO>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/questionnaires/${encode(id)}`,
    project: (payload) => pick<QuestionnaireDTO>(payload, 'questionnaire'),
  })
}

export function updateQuestionnaire(
  accessToken: string,
  id: string,
  body: UpdateQuestionnaireRequest
): Promise<ProtectedResult<QuestionnaireDTO>> {
  return requestProtected<QuestionnaireDTO>({
    accessToken,
    method: HTTP_METHOD.PATCH,
    path: `/questionnaires/${encode(id)}`,
    body: jsonBody(body),
    project: (payload) => pick<QuestionnaireDTO>(payload, 'questionnaire'),
    visibleFieldNames: QUESTIONNAIRE_FIELD_NAMES,
  })
}

export function deleteQuestionnaire(
  accessToken: string,
  id: string
): Promise<ProtectedResult<OperationAck>> {
  return requestProtected<OperationAck>({
    accessToken,
    method: HTTP_METHOD.DELETE,
    path: `/questionnaires/${encode(id)}`,
    project: projectAck,
  })
}

// --- Versions ---------------------------------------------------------------

export function createVersion(
  accessToken: string,
  id: string
): Promise<ProtectedResult<QuestionnaireVersionDTO>> {
  return requestProtected<QuestionnaireVersionDTO>({
    accessToken,
    method: HTTP_METHOD.POST,
    path: `/questionnaires/${encode(id)}/versions`,
    project: (payload) => pick<QuestionnaireVersionDTO>(payload, 'version'),
  })
}

export function listVersions(
  accessToken: string,
  id: string
): Promise<ProtectedResult<QuestionnaireVersionDTO[]>> {
  return requestProtected<QuestionnaireVersionDTO[]>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/questionnaires/${encode(id)}/versions`,
    project: (payload) => pickArray<QuestionnaireVersionDTO>(payload, 'versions'),
  })
}

export function getVersion(
  accessToken: string,
  id: string,
  versionId: string
): Promise<ProtectedResult<QuestionnaireVersionWithQuestions>> {
  return requestProtected<QuestionnaireVersionWithQuestions>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/questionnaires/${encode(id)}/versions/${encode(versionId)}`,
    project: (payload) =>
      pick<QuestionnaireVersionWithQuestions>(payload, 'version'),
  })
}

export function setVersionQuestions(
  accessToken: string,
  id: string,
  versionId: string,
  body: SetQuestionsRequest
): Promise<ProtectedResult<QuestionnaireVersionWithQuestions>> {
  return requestProtected<QuestionnaireVersionWithQuestions>({
    accessToken,
    method: HTTP_METHOD.PATCH,
    path: `/questionnaires/${encode(id)}/versions/${encode(versionId)}`,
    body: jsonBody(body),
    project: (payload) =>
      pick<QuestionnaireVersionWithQuestions>(payload, 'version'),
    visibleFieldNames: QUESTIONS_FIELD_NAMES,
  })
}

export function publishVersion(
  accessToken: string,
  id: string,
  versionId: string
): Promise<ProtectedResult<QuestionnaireVersionDTO>> {
  return requestProtected<QuestionnaireVersionDTO>({
    accessToken,
    method: HTTP_METHOD.POST,
    path: `/questionnaires/${encode(id)}/versions/${encode(versionId)}/publish`,
    project: (payload) => pick<QuestionnaireVersionDTO>(payload, 'version'),
  })
}

// --- Branch assignments -----------------------------------------------------

export function listQuestionnaireBranches(
  accessToken: string,
  id: string
): Promise<ProtectedResult<QuestionnaireBranchDTO[]>> {
  return requestProtected<QuestionnaireBranchDTO[]>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/questionnaires/${encode(id)}/branches`,
    project: (payload) =>
      pickArray<QuestionnaireBranchDTO>(payload, 'assignments'),
  })
}

export function assignQuestionnaireBranch(
  accessToken: string,
  id: string,
  body: AssignQuestionnaireBranchRequest
): Promise<ProtectedResult<QuestionnaireBranchDTO>> {
  return requestProtected<QuestionnaireBranchDTO>({
    accessToken,
    method: HTTP_METHOD.POST,
    path: `/questionnaires/${encode(id)}/branches`,
    body: jsonBody(body),
    project: (payload) => pick<QuestionnaireBranchDTO>(payload, 'assignment'),
    visibleFieldNames: ASSIGN_BRANCH_FIELD_NAMES,
  })
}

export function unassignQuestionnaireBranch(
  accessToken: string,
  id: string,
  branchId: string
): Promise<ProtectedResult<OperationAck>> {
  return requestProtected<OperationAck>({
    accessToken,
    method: HTTP_METHOD.DELETE,
    path: `/questionnaires/${encode(id)}/branches/${encode(branchId)}`,
    project: projectAck,
  })
}

// --- QR ---------------------------------------------------------------------

export function getQuestionnaireQr(
  accessToken: string,
  id: string
): Promise<ProtectedResult<QrDTO>> {
  return requestProtected<QrDTO>({
    accessToken,
    method: HTTP_METHOD.GET,
    path: `/questionnaires/${encode(id)}/qr`,
    project: (payload) => pick<QrDTO>(payload, 'qr'),
  })
}
