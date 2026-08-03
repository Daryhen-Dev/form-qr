import { requestProtected } from '@/lib/operational-api/client'
import {
  retryableResult,
  safeSuccess,
  isProtectedSuccess,
  type PresignDTO,
  type PresignRequest,
  type ProtectedResult,
} from '@/lib/operational-api/contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Projects the `POST /api/v1/uploads/presign` body `{ uploadUrl, objectKey }`.
 * Validates the JSON as `unknown` before projecting; returns `undefined` for
 * unexpected shapes so the client surfaces a retryable result.
 */
function projectPresign(payload: unknown): PresignDTO | undefined {
  if (!isRecord(payload)) {
    return undefined
  }

  const hasShape =
    typeof payload.uploadUrl === 'string' && typeof payload.objectKey === 'string'

  return hasShape ? (payload as unknown as PresignDTO) : undefined
}

/**
 * Requests a presigned upload target via `POST /api/v1/uploads/presign`.
 * This is a protected `/api/v1` call and carries the access token in
 * Authorization (handled by `requestProtected`).
 */
export async function requestPresign(
  accessToken: string,
  request: PresignRequest
): Promise<ProtectedResult<PresignDTO>> {
  return requestProtected<PresignDTO>({
    accessToken,
    method: 'POST',
    path: '/uploads/presign',
    body: JSON.stringify(request),
    project: projectPresign,
  })
}

/**
 * Uploads a file directly to the presigned `uploadUrl` with a raw `PUT`.
 *
 * CRITICAL: this targets an external, pre-signed object-storage endpoint, so it
 * MUST NOT include the access token / Authorization header and MUST NOT go
 * through `requestProtected` (which always attaches `Authorization: Bearer`).
 * The pre-signed URL already carries its own authorization in the query string.
 *
 * Only the `Content-Type` matching the signed MIME type is sent. Returns `true`
 * when the storage accepts the object.
 */
export async function putPresignedFile(
  uploadUrl: string,
  file: Blob,
  mimeType: string
): Promise<boolean> {
  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: file,
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * End-to-end upload for a `photo`/`file` answer: presign, PUT the file to the
 * returned `uploadUrl` (without any Authorization), and expose ONLY the
 * server-issued `objectKey` as the value to store in the answer.
 *
 * The presigned PUT never receives the access token; the success payload is the
 * bare `objectKey` string, so no upload URL or presign metadata leaks into the
 * answer value.
 */
export async function uploadResponseFile(
  accessToken: string,
  request: PresignRequest,
  file: Blob
): Promise<ProtectedResult<string>> {
  const presign = await requestPresign(accessToken, request)
  if (!isProtectedSuccess(presign)) {
    return presign
  }

  const uploaded = await putPresignedFile(
    presign.data.uploadUrl,
    file,
    request.mimeType
  )
  if (!uploaded) {
    return retryableResult()
  }

  return safeSuccess(presign.data.objectKey)
}
