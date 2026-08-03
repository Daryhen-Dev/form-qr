import { describe, expect, it } from 'vitest'

import {
  createValidationResult,
  PROTECTED_RESULT_KIND,
  redactFailure,
  safeSuccess,
  type UserDTO,
} from '@/lib/operational-api/contracts'
import {
  clearOperationFieldIssue,
  createOperationStates,
  getOperation,
  isOperationPending,
  settleOperation,
  startOperation,
  OPERATION_STATUS,
} from '@/lib/operational-api/operation-state'

const user: UserDTO = {
  id: 'user-1',
  nombres: 'Ana',
  apellidos: 'Pérez',
  cedula: '0102030405',
  role: 'Empleado',
  passwordChangeRequired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('operational API contracts', () => {
  it('keeps successful DTO data in a typed protected result', () => {
    const result = safeSuccess(user)

    expect(result.kind).toBe(PROTECTED_RESULT_KIND.SUCCESS)
    expect(result.data).toEqual(user)
  })

  it('redacts failure details with a fixed safe Spanish message', () => {
    const secret = 'Bearer access-token and stack trace'
    const message = redactFailure(PROTECTED_RESULT_KIND.UNAUTHENTICATED, {
      authorization: secret,
      stack: secret,
    })

    expect(message).toContain('sesión')
    expect(message).not.toContain(secret)
    expect(message).not.toContain('authorization')
  })

  it('creates generic field issues without serializing API issue details', () => {
    const result = createValidationResult(['nombres', 'nombres', 'invalid path'], true)

    expect(result.fieldIssues).toEqual([
      { field: 'nombres', message: 'Revisá este campo.' },
    ])
    expect(result.generalIssue).toBe('Revisá los campos marcados e intentá nuevamente.')
  })
})

describe('operation state', () => {
  it('allows one pending activation per operation and settles independently', () => {
    const initial = createOperationStates()
    const first = startOperation(initial, 'users:create')
    const duplicate = startOperation(first.states, 'users:create')
    const second = startOperation(first.states, 'branches:create')

    expect(first.started).toBe(true)
    expect(isOperationPending(first.states, 'users:create')).toBe(true)
    expect(duplicate).toEqual({ started: false, states: first.states })
    expect(second.started).toBe(true)
    expect(isOperationPending(second.states, 'branches:create')).toBe(true)

    const settled = settleOperation(second.states, 'users:create', safeSuccess(user))

    expect(getOperation(settled, 'users:create').status).toBe(OPERATION_STATUS.SUCCESS)
    expect(getOperation(settled, 'branches:create').status).toBe(OPERATION_STATUS.PENDING)
  })

  it('keeps validation state separate and clears only the corrected visible field', () => {
    const validation = createValidationResult(['nombres', 'apellidos'], false)
    const states = settleOperation(
      createOperationStates(),
      'users:update',
      validation
    )

    const updated = clearOperationFieldIssue(states, 'users:update', 'nombres')
    const result = getOperation(updated, 'users:update').result

    expect(getOperation(updated, 'users:update').status).toBe(OPERATION_STATUS.ERROR)
    expect(result).toEqual({
      kind: PROTECTED_RESULT_KIND.VALIDATION,
      fieldIssues: [{ field: 'apellidos', message: 'Revisá este campo.' }],
      generalIssue: null,
    })
  })
})
