export const LOGIN_FIELD = {
  CEDULA: 'cedula',
  PASSWORD: 'password',
} as const

export const LOGIN_VALIDATION = {
  CEDULA_MIN_LENGTH: 6,
  CEDULA_MAX_LENGTH: 15,
  CEDULA_ERROR: 'Ingrese una cédula de 6 a 15 dígitos.',
  PASSWORD_REQUIRED_ERROR: 'La contraseña es obligatoria.',
} as const

const CEDULA_PATTERN = new RegExp(
  `^[0-9]{${LOGIN_VALIDATION.CEDULA_MIN_LENGTH},${LOGIN_VALIDATION.CEDULA_MAX_LENGTH}}$`
)

export type LoginField = (typeof LOGIN_FIELD)[keyof typeof LOGIN_FIELD]

export interface LoginCredentials {
  cedula: string
  password: string
}

export type FieldErrors = Partial<Record<LoginField, string>>

export interface LoginFormState {
  credentials: LoginCredentials
  fieldErrors: FieldErrors
}

export function validateCedula(cedula: string): string | undefined {
  return CEDULA_PATTERN.test(cedula) ? undefined : LOGIN_VALIDATION.CEDULA_ERROR
}

export function validatePassword(password: string): string | undefined {
  return password.length > 0 ? undefined : LOGIN_VALIDATION.PASSWORD_REQUIRED_ERROR
}

export function updateLoginField(
  state: LoginFormState,
  field: LoginField,
  value: string
): LoginFormState {
  const error = field === LOGIN_FIELD.CEDULA ? validateCedula(value) : validatePassword(value)
  const fieldErrors = { ...state.fieldErrors }

  if (error === undefined) {
    delete fieldErrors[field]
  } else {
    fieldErrors[field] = error
  }

  return {
    credentials: { ...state.credentials, [field]: value },
    fieldErrors,
  }
}

export function canSubmit(fieldErrors: FieldErrors): boolean {
  return Object.values(fieldErrors).every((error) => error === undefined)
}

export interface LoginRequest {
  method: 'POST'
  headers: {
    'Content-Type': 'application/json'
  }
  body: string
}

export function buildLoginRequest(credentials: LoginCredentials): LoginRequest {
  const { cedula, password } = credentials

  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cedula, password }),
  }
}

export const SESSION_AVAILABILITY = {
  AVAILABLE: 'available',
  RESTRICTED: 'restricted',
} as const

export type SessionAvailability =
  (typeof SESSION_AVAILABILITY)[keyof typeof SESSION_AVAILABILITY]

export interface LoginSuccessPayload {
  accessToken: string
  refreshToken: string
  user: Record<string, unknown>
  passwordChangeRequired: boolean
}

export interface SessionState extends LoginSuccessPayload {
  availability: SessionAvailability
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function translate422FieldErrors(payload: unknown): FieldErrors {
  if (!isRecord(payload) || !Array.isArray(payload.issues)) {
    return {}
  }

  const fieldErrors: FieldErrors = {}

  for (const issue of payload.issues) {
    if (!isRecord(issue) || !Array.isArray(issue.path)) {
      continue
    }

    switch (issue.path[0]) {
      case LOGIN_FIELD.CEDULA:
        fieldErrors.cedula = LOGIN_VALIDATION.CEDULA_ERROR
        break
      case LOGIN_FIELD.PASSWORD:
        fieldErrors.password = LOGIN_VALIDATION.PASSWORD_REQUIRED_ERROR
        break
    }
  }

  return fieldErrors
}

function isLoginSuccessPayload(payload: unknown): payload is LoginSuccessPayload {
  if (!isRecord(payload)) {
    return false
  }

  return (
    isNonEmptyString(payload.accessToken) &&
    isNonEmptyString(payload.refreshToken) &&
    isRecord(payload.user) &&
    typeof payload.passwordChangeRequired === 'boolean'
  )
}

export function deriveSessionState(payload: unknown): SessionState | undefined {
  if (!isLoginSuccessPayload(payload)) {
    return undefined
  }

  return {
    ...payload,
    availability: payload.passwordChangeRequired
      ? SESSION_AVAILABILITY.RESTRICTED
      : SESSION_AVAILABILITY.AVAILABLE,
  }
}

export const LOGIN_STATUS_MESSAGE = {
  RETRYABLE_FAILURE: 'No fue posible iniciar sesión. Inténtelo nuevamente.',
} as const

export interface ResolvedLoginResponse {
  retryable: boolean
  session?: SessionState
  statusMessage?: string
}

const SAFE_RETRYABLE_LOGIN_RESULT = {
  retryable: true,
  statusMessage: LOGIN_STATUS_MESSAGE.RETRYABLE_FAILURE,
} as const

function createRetryableLoginFailure(): ResolvedLoginResponse {
  return { ...SAFE_RETRYABLE_LOGIN_RESULT }
}

export function resolveLoginResponse(
  status: number | undefined,
  body: string
): ResolvedLoginResponse {
  if (status !== 200) {
    return createRetryableLoginFailure()
  }

  try {
    const session = deriveSessionState(JSON.parse(body) as unknown)

    if (session === undefined) {
      return createRetryableLoginFailure()
    }

    return { retryable: false, session }
  } catch {
    return createRetryableLoginFailure()
  }
}
