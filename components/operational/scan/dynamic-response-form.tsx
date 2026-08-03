"use client"

import { useState } from "react"

import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import {
  fieldIssueMessage,
  operationFeedback,
} from "@/components/operational/admin/operation-feedback"
import { QuestionControl } from "@/components/operational/scan/question-control"
import {
  isProtectedSuccess,
  PROTECTED_RESULT_KIND,
  type AnswerDTO,
  type QuestionDTO,
  type ResponseDTO,
} from "@/lib/operational-api/contracts"
import {
  clearOperationFieldIssue,
  createOperationStates,
  getOperation,
  isOperationPending,
  settleOperation,
  startOperation,
  type OperationStates,
} from "@/lib/operational-api/operation-state"
import {
  buildAnswerInput,
  isUploadActive,
  resolveResponseAction,
} from "@/lib/operational-api/response-input"
import { createResponse, updateResponse } from "@/lib/operational-api/responses"
import { QUESTION_TYPE, type ResponseStatus } from "@/lib/types"

/**
 * Daily response form for a resolved QR scan.
 *
 * Renders one {@link QuestionControl} per ordered question and, depending on
 * the scan status, creates (`absent`) or updates (`editable`) the Respuesta
 * Diaria through the existing `/api/v1/responses` contracts (Requirements 5.3,
 * 5.4). Raw values are converted to typed `AnswerInput`s with `buildAnswerInput`
 * only at submit time.
 *
 * CRITICAL: for a `read_only` scan `resolveResponseAction` yields `none`, so the
 * submit control and every input are disabled and uploads are inactive — no
 * create, update, or presign can be issued (Requirement 5.5).
 *
 * A single protected submission is pending at a time (Requirement 7.1). On HTTP
 * 409 the parent re-resolves the QR link and enables only the action allowed by
 * the returned status (`onRescan`, Requirement 5.7). On HTTP 422 or a network
 * failure the entered non-sensitive values are preserved, identifiable issues
 * are associated with their controls, and at most one safe general message is
 * shown for the rest (Requirement 5.8).
 */

const RESPONSE_OPERATION = "response-form"

interface DynamicResponseFormProps {
  readonly accessToken: string
  readonly questionnaireId: string
  readonly questions: readonly QuestionDTO[]
  readonly status: ResponseStatus
  readonly response: ResponseDTO | null
  /** Re-resolves the QR link (used after success and on conflict). */
  readonly onRescan: () => void
}

/** Contract-valid default raw value for a freshly created answer. */
function defaultRawValue(question: QuestionDTO): unknown {
  switch (question.type) {
    case QUESTION_TYPE.BOOLEAN:
      return false
    case QUESTION_TYPE.MULTIPLE_CHOICE:
      return []
    case QUESTION_TYPE.SCALE: {
      const min = question.config.min
      return typeof min === "number" && Number.isFinite(min) ? min : ""
    }
    default:
      return ""
  }
}

/** Seeds the editable raw values from an existing response, or defaults. */
function initialRawValues(
  questions: readonly QuestionDTO[],
  response: ResponseDTO | null
): Record<string, unknown> {
  const byQuestion = new Map<string, AnswerDTO["value"]>(
    (response?.answers ?? []).map((answer) => [answer.questionId, answer.value])
  )

  const entries = questions.map((question) => {
    const stored = byQuestion.get(question.id)
    return [
      question.id,
      stored === undefined ? defaultRawValue(question) : stored,
    ] as const
  })

  return Object.fromEntries(entries)
}

const STATUS_LABEL: Record<ResponseStatus, string> = {
  absent: "Aún no has registrado la respuesta de hoy.",
  editable: "Puedes editar tu respuesta de hoy.",
  read_only: "Tu respuesta de hoy ya no puede modificarse.",
}

export function DynamicResponseForm({
  accessToken,
  questionnaireId,
  questions,
  status,
  response,
  onRescan,
}: DynamicResponseFormProps) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    initialRawValues(questions, response)
  )
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const action = resolveResponseAction(status)
  const uploadActive = isUploadActive(status)
  const isReadOnly = action === "none"

  const operation = getOperation(states, RESPONSE_OPERATION)
  const feedback = operationFeedback(operation)
  const pending = isOperationPending(states, RESPONSE_OPERATION)
  const controlsDisabled = isReadOnly || pending

  function updateValue(questionId: string, value: unknown) {
    setValues((current) => ({ ...current, [questionId]: value }))
    setStates((current) =>
      clearOperationFieldIssue(current, RESPONSE_OPERATION, questionId)
    )
  }

  async function handleSubmit() {
    if (isReadOnly || isOperationPending(states, RESPONSE_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      RESPONSE_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const answers = questions.map((question) =>
      buildAnswerInput(question, values[question.id])
    )

    const result =
      action === "create"
        ? await createResponse(accessToken, { questionnaireId, answers })
        : await updateResponse(accessToken, response?.id ?? "", { answers })

    setStates((current) => settleOperation(current, RESPONSE_OPERATION, result))

    // Success and conflict both re-resolve the QR link so the surface reflects
    // the status the server now reports (Requirements 5.7, 7.2).
    if (
      isProtectedSuccess(result) ||
      result.kind === PROTECTED_RESULT_KIND.CONFLICT
    ) {
      onRescan()
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <StatusRegion message={STATUS_LABEL[status]} />

      <ol className="min-w-0 space-y-6">
        {questions.map((question) => (
          <li key={question.id}>
            <QuestionControl
              accessToken={accessToken}
              disabled={controlsDisabled}
              fieldError={fieldIssueMessage(operation.result, question.id)}
              onChange={(value) => updateValue(question.id, value)}
              question={question}
              questionnaireId={questionnaireId}
              uploadActive={uploadActive}
              value={values[question.id]}
            />
          </li>
        ))}
      </ol>

      <StatusRegion message={feedback.message} tone={feedback.tone} />

      {isReadOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <ActionActivation
            className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            disabled={pending}
            onActivate={() => void handleSubmit()}
          >
            {pending
              ? "Guardando…"
              : action === "create"
                ? "Registrar respuesta"
                : "Guardar cambios"}
          </ActionActivation>
        </div>
      )}
    </div>
  )
}

export default DynamicResponseForm
