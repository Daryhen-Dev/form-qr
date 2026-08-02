import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  PASSWORD_CHANGE_VALIDATION,
  buildChangePasswordRequest,
  validateConfirmPassword,
  validateNewPassword,
} from './password-change-ui'

const passwordFixtures = {
  empty: '',
  tooShort: '1234567',
  minimumLength: '12345678',
  secure: 'contraseña-segura',
} as const

const newPasswordExamples = [
  [passwordFixtures.empty, PASSWORD_CHANGE_VALIDATION.MIN_LENGTH_ERROR],
  [passwordFixtures.tooShort, PASSWORD_CHANGE_VALIDATION.MIN_LENGTH_ERROR],
  [passwordFixtures.minimumLength, undefined],
  [passwordFixtures.secure, undefined],
] as const

const confirmPasswordExamples = [
  [passwordFixtures.minimumLength, passwordFixtures.empty, PASSWORD_CHANGE_VALIDATION.MISMATCH_ERROR],
  [passwordFixtures.minimumLength, passwordFixtures.tooShort, PASSWORD_CHANGE_VALIDATION.MISMATCH_ERROR],
  [passwordFixtures.minimumLength, passwordFixtures.minimumLength, undefined],
  [passwordFixtures.secure, passwordFixtures.secure, undefined],
] as const

const authenticatedChangeRequestInputs = fc.record({
  accessToken: fc.string({ minLength: 1 }),
  newPassword: fc.string({ minLength: PASSWORD_CHANGE_VALIDATION.MIN_LENGTH }),
})

describe('password-change-ui validation', () => {
  it.each(newPasswordExamples)(
    'validates the new password minimum length for %s',
    (newPassword, expectedError) => {
      expect(validateNewPassword(newPassword)).toBe(expectedError)
    }
  )

  it.each(confirmPasswordExamples)(
    'validates exact password confirmation for new password %s and confirmation %s',
    (newPassword, confirmPassword, expectedError) => {
      expect(validateConfirmPassword(newPassword, confirmPassword)).toBe(expectedError)
    }
  )

  // Feature: cambio-obligatorio-contrasena, Property 3: Request mínimo autenticado
  // **Validates: Requirements 3.1, 3.2, 3.3**
  it('builds a minimal authenticated change-password request', () => {
    fc.assert(
      fc.property(authenticatedChangeRequestInputs, ({ accessToken, newPassword }) => {
        const request = buildChangePasswordRequest(accessToken, newPassword)
        const body = JSON.parse(request.body) as Record<string, unknown>

        expect(request.method).toBe('POST')
        expect(request.headers).toStrictEqual({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        })
        expect(Object.keys(body)).toStrictEqual(['newPassword'])
        expect(body).toStrictEqual({ newPassword })
      }),
      { numRuns: 100 }
    )
  })
})
