import {
  conflictResult,
  createValidationResult,
  OPERATIONAL_API_PREFIX,
  retryableResult,
  safeSuccess,
  unauthenticatedResult,
  unavailableResult,
  type ProtectedResult,
} from '@/lib/operational-api/contracts'

export const HTTP_METHOD = {
  DELETE: 'DELETE',
  GET: 'GET',
  PATCH: 'PATCH',
  POST: 'POST',
} as const

export type HttpMethod = (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD]

export interface JsonProjector<T> {
  (payload: unknown): T | undefined
}

export interface ProtectedRequest<T> {
  readonly accessToken: string
  readonly method: HttpMethod
  readonly path: string
  readonly body?: BodyInit
  readonly headers?: HeadersInit
  readonly project?: JsonProjector<T>
  readonly visibleFieldNames?: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function apiPath(path: string): string {
  return `${OPERATIONAL_API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`
}

async function readJson(response: Response): Promise<unknown | undefined> {
  try {
    return (await response.json()) as unknown
  } catch {
    return undefined
  }
}

function visibleIssueFields(
  payload: unknown,
  visibleFieldNames: readonly string[]
): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.issues)) {
    return []
  }

  const allowedFields = new Set(visibleFieldNames)
  return payload.issues.flatMap((issue) => {
    if (!isRecord(issue) || !Array.isArray(issue.path)) {
      return []
    }

    const field = issue.path[0]
    return typeof field === 'string' && allowedFields.has(field) ? [field] : []
  })
}

function requestHeaders(request: ProtectedRequest<unknown>): Headers {
  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${request.accessToken}`)

  if (request.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return headers
}

function statusResult<T>(status: number): ProtectedResult<T> | undefined {
  if (status === 401) return unauthenticatedResult()
  if (status === 403 || status === 404) return unavailableResult()
  if (status === 409) return conflictResult()
  return undefined
}

function isSuccessfulStatus(status: number): boolean {
  return status === 200 || status === 201
}

function projectSuccess<T>(
  payload: unknown,
  project: JsonProjector<T> | undefined
): ProtectedResult<T> {
  try {
    const data = project === undefined ? (payload as T) : project(payload)
    return data === undefined ? retryableResult() : safeSuccess(data)
  } catch {
    return retryableResult()
  }
}

export async function requestProtected<T>(
  request: ProtectedRequest<T>
): Promise<ProtectedResult<T>> {
  try {
    const response = await fetch(apiPath(request.path), {
      method: request.method,
      headers: requestHeaders(request),
      body: request.body,
    })
    const result = statusResult<T>(response.status)
    if (result !== undefined) return result

    const payload = await readJson(response)
    if (response.status === 422) {
      const fields = visibleIssueFields(
        payload,
        request.visibleFieldNames ?? []
      )
      return createValidationResult(fields, fields.length === 0)
    }

    if (!isSuccessfulStatus(response.status) || payload === undefined) {
      return retryableResult()
    }

    return projectSuccess(payload, request.project)
  } catch {
    return retryableResult()
  }
}
