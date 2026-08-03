import { requestProtected } from '@/lib/operational-api/client'
import type {
  CreateResponseRequest,
  ProtectedResult,
  ResponseDTO,
  UpdateResponseRequest,
} from '@/lib/operational-api/contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Projects the response envelope `{ response: ResponseDTO }` returned by
 * `POST /api/v1/responses` and `PATCH /api/v1/responses/:id`. Validates the JSON
 * as `unknown` before projecting; returns `undefined` for unexpected shapes so
 * the client surfaces a retryable result.
 */
function projectResponse(payload: unknown): ResponseDTO | undefined {
  if (!isRecord(payload) || !isRecord(payload.response)) {
    return undefined
  }

  const response = payload.response
  const hasShape =
    typeof response.id === 'string' &&
    typeof response.questionnaireId === 'string' &&
    typeof response.status === 'string' &&
    Array.isArray(response.answers)

  return hasShape ? (response as unknown as ResponseDTO) : undefined
}

/**
 * Creates a Respuesta_Diaria via `POST /api/v1/responses` when the scan status
 * is `absent`. Sends the `questionnaireId` and typed `AnswerInput[]`.
 */
export async function createResponse(
  accessToken: string,
  request: CreateResponseRequest
): Promise<ProtectedResult<ResponseDTO>> {
  return requestProtected<ResponseDTO>({
    accessToken,
    method: 'POST',
    path: '/responses',
    body: JSON.stringify(request),
    project: projectResponse,
  })
}

/**
 * Updates an existing Respuesta_Diaria via `PATCH /api/v1/responses/:id` when
 * the scan status is `editable`. Sends the typed `AnswerInput[]`.
 */
export async function updateResponse(
  accessToken: string,
  responseId: string,
  request: UpdateResponseRequest
): Promise<ProtectedResult<ResponseDTO>> {
  return requestProtected<ResponseDTO>({
    accessToken,
    method: 'PATCH',
    path: `/responses/${encodeURIComponent(responseId)}`,
    body: JSON.stringify(request),
    project: projectResponse,
  })
}
