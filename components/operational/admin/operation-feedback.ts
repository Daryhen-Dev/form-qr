/**
 * Shared, presentation-only mapping from a settled protected operation to the
 * safe feedback the admin surfaces render.
 *
 * A single general `StatusRegion` message is derived per operation, and field
 * issues are looked up by control name so they can be associated with the
 * affected input via `aria-invalid` / `aria-describedby`. Nothing here ever
 * exposes response bodies, headers, tokens, or other internal detail — it only
 * reuses the already-redacted `ProtectedResult` shape (Requirements 7.6, 7.8,
 * 8.3, 8.4).
 */
import {
  PROTECTED_RESULT_KIND,
  redactFailure,
  SAFE_STATUS_MESSAGE,
  type ProtectedResult,
} from "@/lib/operational-api/contracts"
import {
  OPERATION_STATUS,
  type OperationRecord,
} from "@/lib/operational-api/operation-state"

export const FEEDBACK_TONE = {
  INFO: "info",
  ERROR: "error",
} as const

export type FeedbackTone = (typeof FEEDBACK_TONE)[keyof typeof FEEDBACK_TONE]

export interface OperationFeedback {
  readonly message: string | undefined
  readonly tone: FeedbackTone
}

/**
 * Safe general message for a settled result, or `undefined` when there is
 * nothing general to show (success, still pending, or a 422 whose issues are
 * all associated with visible controls).
 */
export function generalIssueMessage(
  result: ProtectedResult<unknown> | null
): string | undefined {
  if (result === null || result.kind === PROTECTED_RESULT_KIND.SUCCESS) {
    return undefined
  }

  if (result.kind === PROTECTED_RESULT_KIND.VALIDATION) {
    return result.generalIssue ?? undefined
  }

  return redactFailure(result.kind)
}

/** Derive the single status-region message/tone for an operation record. */
export function operationFeedback(record: OperationRecord): OperationFeedback {
  if (record.status === OPERATION_STATUS.SUCCESS) {
    return { message: SAFE_STATUS_MESSAGE.SUCCESS, tone: FEEDBACK_TONE.INFO }
  }

  if (record.status === OPERATION_STATUS.ERROR) {
    return {
      message: generalIssueMessage(record.result),
      tone: FEEDBACK_TONE.ERROR,
    }
  }

  return { message: undefined, tone: FEEDBACK_TONE.INFO }
}

/** Field-level issue message for a control, or `undefined` when none applies. */
export function fieldIssueMessage(
  result: ProtectedResult<unknown> | null,
  field: string
): string | undefined {
  if (result?.kind !== PROTECTED_RESULT_KIND.VALIDATION) {
    return undefined
  }

  return result.fieldIssues.find((issue) => issue.field === field)?.message
}
