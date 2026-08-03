import {
  clearValidationFieldIssue,
  PROTECTED_RESULT_KIND,
  type ProtectedResult,
  type ProtectedResultKind,
} from '@/lib/operational-api/contracts'

export const OPERATION_STATUS = {
  IDLE: 'idle',
  PENDING: 'pending',
  SUCCESS: 'success',
  ERROR: 'error',
} as const

export type OperationStatus =
  (typeof OPERATION_STATUS)[keyof typeof OPERATION_STATUS]

export type OperationDraft = Readonly<Record<string, unknown>>

export interface OperationRecord {
  readonly status: OperationStatus
  readonly result: ProtectedResult<unknown> | null
  readonly draft?: OperationDraft
}

export type OperationStates = Readonly<Record<string, OperationRecord>>

export interface StartOperationResult {
  readonly started: boolean
  readonly states: OperationStates
}

const IDLE_OPERATION: OperationRecord = {
  status: OPERATION_STATUS.IDLE,
  result: null,
}

export const OPERATION_STATUS_BY_RESULT_KIND = {
  [PROTECTED_RESULT_KIND.SUCCESS]: OPERATION_STATUS.SUCCESS,
  [PROTECTED_RESULT_KIND.UNAUTHENTICATED]: OPERATION_STATUS.ERROR,
  [PROTECTED_RESULT_KIND.UNAVAILABLE]: OPERATION_STATUS.ERROR,
  [PROTECTED_RESULT_KIND.CONFLICT]: OPERATION_STATUS.ERROR,
  [PROTECTED_RESULT_KIND.VALIDATION]: OPERATION_STATUS.ERROR,
  [PROTECTED_RESULT_KIND.RETRYABLE]: OPERATION_STATUS.ERROR,
} as const satisfies Readonly<Record<ProtectedResultKind, OperationStatus>>

export function operationStatusForResult<T>(
  result: ProtectedResult<T>
): OperationStatus {
  return OPERATION_STATUS_BY_RESULT_KIND[result.kind]
}

export function clearVisibleFieldIssue<T>(
  result: ProtectedResult<T> | null,
  field: string
): ProtectedResult<T> | null {
  if (result?.kind !== PROTECTED_RESULT_KIND.VALIDATION) {
    return result
  }

  return clearValidationFieldIssue(result, field)
}

export function createOperationStates(): OperationStates {
  return {}
}

export function getOperation(
  states: OperationStates,
  operationId: string
): OperationRecord {
  return states[operationId] ?? IDLE_OPERATION
}

export function isOperationPending(
  states: OperationStates,
  operationId: string
): boolean {
  return getOperation(states, operationId).status === OPERATION_STATUS.PENDING
}

export function startOperation(
  states: OperationStates,
  operationId: string
): StartOperationResult {
  if (isOperationPending(states, operationId)) {
    return { started: false, states }
  }

  const operation = getOperation(states, operationId)

  return {
    started: true,
    states: {
      ...states,
      [operationId]: {
        ...operation,
        status: OPERATION_STATUS.PENDING,
        result: null,
      },
    },
  }
}

export function settleOperation<T>(
  states: OperationStates,
  operationId: string,
  result: ProtectedResult<T>
): OperationStates {
  const operation = getOperation(states, operationId)

  return {
    ...states,
    [operationId]: {
      ...operation,
      status: operationStatusForResult(result),
      result,
    },
  }
}

export function clearOperationFieldIssue(
  states: OperationStates,
  operationId: string,
  field: string
): OperationStates {
  const operation = getOperation(states, operationId)
  const result = clearVisibleFieldIssue(operation.result, field)

  if (result === operation.result) {
    return states
  }

  return {
    ...states,
    [operationId]: {
      ...operation,
      result,
    },
  }
}
