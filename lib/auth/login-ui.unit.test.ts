import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  LOGIN_FIELD,
  SESSION_AVAILABILITY,
  buildLoginRequest,
  canSubmit,
  deriveSessionState,
  resolveLoginResponse,
  translate422FieldErrors,
  updateLoginField,
  validateCedula,
  validatePassword,
} from './login-ui'

const cedulaError = 'Ingrese una cédula de 6 a 15 dígitos.'
const passwordRequiredError = 'La contraseña es obligatoria.'

const credentials = fc.record({ cedula: fc.string(), password: fc.string() })
const optionalFieldError = fc.option(fc.string({ minLength: 1 }), { nil: undefined })
const validCedula = fc
  .array(fc.constantFrom(...'0123456789'), { minLength: 6, maxLength: 15 })
  .map((digits) => digits.join(''))
const validPassword = fc.string({ minLength: 1 })
const validCredentials = fc.record({ cedula: validCedula, password: validPassword })
const successUserFixture = fc.record({
  id: fc.string({ minLength: 1 }),
  nombres: fc.string({ minLength: 1 }),
  apellidos: fc.string({ minLength: 1 }),
  cedula: validCedula,
  role: fc.constantFrom('Administrador', 'Secretario', 'Empleado'),
  passwordChangeRequired: fc.boolean(),
  createdAt: fc.constant('2026-01-01T00:00:00.000Z'),
  updatedAt: fc.constant('2026-01-01T00:00:00.000Z'),
})
const successPayloadFixture = fc.record({
  accessToken: fc.string({ minLength: 1 }),
  refreshToken: fc.string({ minLength: 1 }),
  user: successUserFixture,
  passwordChangeRequired: fc.boolean(),
})
const incompleteSuccessPayloadFixture = fc.oneof(
  successPayloadFixture.map(({ accessToken: _accessToken, ...payload }) => payload),
  successPayloadFixture.map(({ refreshToken: _refreshToken, ...payload }) => payload),
  successPayloadFixture.map(({ user: _user, ...payload }) => payload),
  successPayloadFixture.map(({ passwordChangeRequired: _passwordChangeRequired, ...payload }) => payload)
)
const validationIssuePaths = fc.oneof(
  fc.tuple(
    fc.constantFrom(LOGIN_FIELD.CEDULA, LOGIN_FIELD.PASSWORD),
    fc.array(fc.string(), { maxLength: 3 })
  ),
  fc.tuple(
    fc.string().map((pathSegment) => `other-${pathSegment}`),
    fc.array(fc.string(), { maxLength: 3 })
  )
)
const validationIssue = fc
  .tuple(fc.string(), fc.string(), validationIssuePaths)
  .map(([code, message, [initialPath, pathTail]]) => ({
    code,
    message,
    path: [initialPath, ...pathTail],
  }))
const validationIssues = fc.array(validationIssue, { maxLength: 10 })

const formStateWithError = (field: keyof typeof LOGIN_FIELD, error: string) =>
  fc.record({
    credentials,
    fieldErrors: fc.record({
      cedula: field === LOGIN_FIELD.CEDULA ? fc.constant(error) : optionalFieldError,
      password: field === LOGIN_FIELD.PASSWORD ? fc.constant(error) : optionalFieldError,
    }),
  })

const isolatedFieldEdit = (field: keyof typeof LOGIN_FIELD, error: string) =>
  fc
    .tuple(formStateWithError(field, error), fc.string())
    .map(([state, value]) => ({ field, state, value }))

const isolatedFieldEdits = fc.oneof(
  isolatedFieldEdit(LOGIN_FIELD.CEDULA, cedulaError),
  isolatedFieldEdit(LOGIN_FIELD.PASSWORD, passwordRequiredError)
)

describe('login-ui validation', () => {
  it.each([
    ['', false],
    ['12345', false],
    ['123456', true],
    ['123456789012345', true],
    ['1234567890123456', false],
    ['12345a', false],
    ['１２３４５６', false],
  ])('validates the cédula boundary %s', (cedula, isValid) => {
    expect(validateCedula(cedula)).toBe(isValid ? undefined : cedulaError)
  })

  it('requires a non-empty password', () => {
    expect(validatePassword('')).toBe(passwordRequiredError)
  })

  const cedulas = fc.string({ maxLength: 32 })
  const errors = fc.constantFrom(
    { cedula: cedulaError },
    { password: passwordRequiredError },
    { cedula: cedulaError, password: passwordRequiredError }
  )

  // Feature: login-ui, Property 1: La validación local coincide con el contrato y bloquea el envío
  it('validates cédulas and blocks field errors', () => {
    fc.assert(
      fc.property(cedulas, errors, (cedula, fieldErrors) => {
        expect(validateCedula(cedula) === undefined).toBe(/^[0-9]{6,15}$/.test(cedula))
        expect(canSubmit(fieldErrors)).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  // Feature: login-ui, Property 2: La corrección de un campo no modifica el otro
  it('preserves the other field while correcting one field', () => {
    fc.assert(
      fc.property(isolatedFieldEdits, ({ field, state, value }) => {
        const otherField =
          field === LOGIN_FIELD.CEDULA ? LOGIN_FIELD.PASSWORD : LOGIN_FIELD.CEDULA
        const updatedState = updateLoginField(state, field, value)

        expect(updatedState.credentials[otherField]).toBe(state.credentials[otherField])
        expect(updatedState.fieldErrors[otherField]).toBe(state.fieldErrors[otherField])
      }),
      { numRuns: 100 }
    )
  })

  // Feature: login-ui, Property 3: La solicitud de inicio de sesión es mínima y fiel
  it('builds a minimal and faithful login request', () => {
    fc.assert(
      fc.property(validCredentials, (credentials) => {
        const request = buildLoginRequest(credentials)
        const body = JSON.parse(request.body) as Record<string, unknown>

        expect(request.method).toBe('POST')
        expect(request.headers).toMatchObject({ 'Content-Type': 'application/json' })
        expect(Object.keys(body).sort()).toStrictEqual(['cedula', 'password'])
        expect(body.cedula).toBe(credentials.cedula)
        expect(body.password).toBe(credentials.password)
      }),
      { numRuns: 100 }
    )
  })

  // Feature: login-ui, Property 4: Un éxito completo deriva una sesión disponible solo cuando corresponde
  it('derives available or restricted sessions only from complete success payloads', () => {
    fc.assert(
      fc.property(successPayloadFixture, incompleteSuccessPayloadFixture, (payload, incompletePayload) => {
        const session = deriveSessionState(payload)

        expect(session).toStrictEqual({
          ...payload,
          availability: payload.passwordChangeRequired
            ? SESSION_AVAILABILITY.RESTRICTED
            : SESSION_AVAILABILITY.AVAILABLE,
        })
        expect(deriveSessionState(incompletePayload)).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  // Feature: login-ui, Property 5: Los problemas `422` se asocian únicamente a sus campos indicados
  it('translates only recognized 422 issue paths into localized field errors', () => {
    fc.assert(
      fc.property(validationIssues, (issues) => {
        const fieldErrors = translate422FieldErrors({ error: 'validation_failed', issues })
        const hasCedulaIssue = issues.some((issue) => issue.path[0] === LOGIN_FIELD.CEDULA)
        const hasPasswordIssue = issues.some((issue) => issue.path[0] === LOGIN_FIELD.PASSWORD)

        expect(fieldErrors).toStrictEqual({
          ...(hasCedulaIssue ? { cedula: cedulaError } : {}),
          ...(hasPasswordIssue ? { password: passwordRequiredError } : {}),
        })
        expect(deriveSessionState(fieldErrors)).toBeUndefined()
      }),
      { numRuns: 100 }
    )
  })

  const safeRetryableStatusMessage = 'No fue posible iniciar sesión. Inténtelo nuevamente.'
  const unexpectedHttpStatus = fc
    .integer({ min: 100, max: 599 })
    .filter((status) => status !== 200 && status !== 401 && status !== 422)
  const retryableFailureCases = fc.oneof(
    fc.uuid().map((identifier) => {
      const networkDetail = `network-detail-${identifier}`

      return {
        status: undefined,
        body: networkDetail,
        bodyValues: [networkDetail],
      }
    }),
    fc.uuid().map((identifier) => {
      const invalidJsonDetail = `invalid-json-detail-${identifier}`

      return {
        status: 200,
        body: `${invalidJsonDetail}{`,
        bodyValues: [invalidJsonDetail],
      }
    }),
    fc.tuple(unexpectedHttpStatus, fc.uuid()).map(([status, identifier]) => {
      const unexpectedDetail = `unexpected-detail-${identifier}`

      return {
        status,
        body: JSON.stringify({ detail: unexpectedDetail }),
        bodyValues: [unexpectedDetail],
      }
    }),
    fc.uuid().map((identifier) => {
      const accessToken = `access-token-${identifier}`
      const refreshToken = `refresh-token-${identifier}`
      const userDetail = `user-detail-${identifier}`

      return {
        status: 200,
        body: JSON.stringify({
          accessToken,
          refreshToken,
          user: { detail: userDetail },
          passwordChangeRequired: 'false',
        }),
        bodyValues: [accessToken, refreshToken, userDetail, 'false'],
      }
    })
  )

  // Feature: login-ui, Property 6: Las respuestas desconocidas fallan de forma segura
  it('returns retryable safe results for unavailable, invalid, unexpected, and malformed responses', () => {
    fc.assert(
      fc.property(retryableFailureCases, ({ status, body, bodyValues }) => {
        const result = resolveLoginResponse(status, body)

        expect(result.retryable).toBe(true)
        expect(result.session).toBeUndefined()
        expect(result.statusMessage).toBe(safeRetryableStatusMessage)
        bodyValues.forEach((value) => expect(result.statusMessage).not.toContain(value))
      }),
      { numRuns: 100 }
    )
  })
})
