import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  createValidationResult,
  PROTECTED_RESULT_KIND,
  retryableResult,
  safeSuccess,
  unauthenticatedResult,
  unavailableResult,
  conflictResult,
  type ProtectedResult,
} from '@/lib/operational-api/contracts'
import {
  createOperationStates,
  getOperation,
  isOperationPending,
  OPERATION_STATUS,
  settleOperation,
  startOperation,
  type OperationRecord,
  type OperationStates,
} from '@/lib/operational-api/operation-state'

// Feature: operational-web-application, Property 6: Resultado de operación
// **Validates: Requirements 3.6, 3.7, 4.7, 5.7, 5.8, 6.7, 7.1, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 8.4**

const operationIdArbitrary = fc.stringMatching(/^[a-z][a-z0-9:_-]{0,40}$/)
const draftArbitrary = fc.dictionary(
  fc.constantFrom('name', 'code', 'notes'),
  fc.string({ maxLength: 80 }),
  { maxKeys: 3 }
)
const resultArbitrary: fc.Arbitrary<ProtectedResult<unknown>> = fc.oneof(
  fc.constant(safeSuccess({ id: 'updated-record' })),
  fc.constant(unauthenticatedResult()),
  fc.constant(unavailableResult()),
  fc.constant(conflictResult()),
  fc.constant(retryableResult()),
  fc.boolean().map((hasGeneralIssue) =>
    createValidationResult(['name', 'code'], hasGeneralIssue)
  )
)

describe('operation result state', () => {
  it('keeps one pending request, preserves a non-sensitive draft, and exposes safe settled results', () => {
    fc.assert(
      fc.property(operationIdArbitrary, draftArbitrary, resultArbitrary, (operationId, draft, result) => {
        const initial = {
          ...createOperationStates(),
          [operationId]: { status: OPERATION_STATUS.IDLE, result: null, draft },
        } as OperationStates
        const started = startOperation(initial, operationId)
        const duplicate = startOperation(started.states, operationId)
        const settled = settleOperation(started.states, operationId, result)
        const operation = getOperation(settled, operationId) as OperationRecord & { readonly draft?: typeof draft }

        expect(started.started).toBe(true)
        expect(duplicate.started).toBe(false)
        expect(isOperationPending(started.states, operationId)).toBe(true)
        expect(isOperationPending(settled, operationId)).toBe(false)
        expect(operation.status).toBe(result.kind === PROTECTED_RESULT_KIND.SUCCESS ? OPERATION_STATUS.SUCCESS : OPERATION_STATUS.ERROR)
        expect(operation.result).toEqual(result)
        expect(operation.draft).toEqual(draft)
        if (result.kind === PROTECTED_RESULT_KIND.VALIDATION) {
          const settledValidation =
            operation.result?.kind === PROTECTED_RESULT_KIND.VALIDATION
              ? operation.result
              : null

          expect(settledValidation).not.toBeNull()
          expect(settledValidation?.fieldIssues).toEqual(result.fieldIssues)
          expect(settledValidation?.generalIssue).toEqual(result.generalIssue)
        }
      }),
      { numRuns: 100 }
    )
  })
})
