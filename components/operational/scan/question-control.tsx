"use client"

import { UploadField } from "@/components/operational/scan/upload-field"
import { Alert } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { QUESTION_TYPE, type QuestionDTO } from "@/lib/types"

/**
 * Single dynamic answer control for the employee scan flow.
 *
 * Dispatches each of the eleven question types to an accessible control that
 * respects the type and configuration received from the scan resolution, and
 * surfaces the question's mandatory character (Requirement 5.2). The control is
 * fully controlled: it holds no answer state itself and only emits the next raw
 * value through `onChange`. The parent form turns raw values into typed
 * `AnswerInput`s via `buildAnswerInput` at submit time.
 *
 * CRITICAL: when `uploadActive` is false (scan status `read_only`) the
 * `photo`/`file` control renders a read-only view and never issues a presign or
 * upload (Requirements 5.5, 8.4). When `disabled` is true every control is
 * inert so a `read_only` scan or a pending operation cannot mutate anything.
 *
 * Validation issues from HTTP 422 are associated with the control through
 * `aria-invalid` / `aria-describedby` and announced to assistive technology
 * (Requirements 5.8, 9.3).
 */

interface ChoiceOption {
  readonly id: string
  readonly label: string
}

export interface QuestionControlProps {
  readonly question: QuestionDTO
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  /** Disables the control (scan `read_only` or a pending operation). */
  readonly disabled: boolean
  /** Whether file/photo uploads are active for the current scan status. */
  readonly uploadActive: boolean
  readonly accessToken: string
  readonly questionnaireId: string
  readonly fieldError?: string
}

function optionsOf(config: Record<string, unknown>): ChoiceOption[] {
  const raw = config.options
  if (!Array.isArray(raw)) {
    return []
  }

  return raw.flatMap((option) => {
    if (
      option !== null &&
      typeof option === "object" &&
      typeof (option as { id?: unknown }).id === "string"
    ) {
      const typed = option as { id: string; label?: unknown }
      return [
        {
          id: typed.id,
          label: typeof typed.label === "string" ? typed.label : typed.id,
        },
      ]
    }
    return []
  })
}

function numberConfigValue(
  config: Record<string, unknown>,
  key: string
): number | undefined {
  const value = config[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function asText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return ""
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

export function QuestionControl({
  question,
  value,
  onChange,
  disabled,
  uploadActive,
  accessToken,
  questionnaireId,
  fieldError,
}: QuestionControlProps) {
  const inputId = `answer-${question.id}`
  const errorId = `${inputId}-error`
  const describedBy = fieldError ? errorId : undefined
  const requiredLabel = question.required ? " (obligatoria)" : ""

  // `photo`/`file` delegate error rendering to UploadField so the associated
  // message is not rendered twice under the same id.
  const controlOwnsError =
    question.type === QUESTION_TYPE.PHOTO || question.type === QUESTION_TYPE.FILE

  const errorAlert =
    fieldError && !controlOwnsError ? (
      <Alert aria-live="assertive" id={errorId} variant="destructive">
        {fieldError}
      </Alert>
    ) : null

  // Grouped controls (choice families) own their accessible name through a
  // <legend>; single-field controls use an associated <Label>.
  const control = renderControl()

  if (
    question.type === QUESTION_TYPE.SINGLE_CHOICE ||
    question.type === QUESTION_TYPE.MULTIPLE_CHOICE
  ) {
    return (
      <fieldset
        aria-describedby={describedBy}
        aria-invalid={fieldError ? true : undefined}
        className="min-w-0 space-y-2 border-0 p-0"
      >
        <legend className="text-sm font-medium">
          {question.prompt}
          {requiredLabel}
        </legend>
        {control}
        {errorAlert}
      </fieldset>
    )
  }

  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={inputId}>
        {question.prompt}
        {requiredLabel}
      </Label>
      {control}
      {errorAlert}
    </div>
  )

  function renderControl() {
    const config = question.config

    switch (question.type) {
      case QUESTION_TYPE.BOOLEAN:
        return (
          <label className="flex items-center gap-2 text-sm" htmlFor={inputId}>
            <input
              aria-describedby={describedBy}
              aria-invalid={fieldError ? true : undefined}
              aria-required={question.required || undefined}
              checked={Boolean(value)}
              className="size-4 rounded border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              disabled={disabled}
              id={inputId}
              onChange={(event) => onChange(event.target.checked)}
              type="checkbox"
            />
            Sí
          </label>
        )

      case QUESTION_TYPE.SINGLE_CHOICE: {
        const options = optionsOf(config)
        const selected = typeof value === "string" ? value : ""
        return (
          <div className="space-y-1" role="radiogroup">
            {options.map((option) => {
              const optionId = `${inputId}-${option.id}`
              return (
                <label
                  className="flex items-center gap-2 text-sm"
                  htmlFor={optionId}
                  key={option.id}
                >
                  <input
                    checked={selected === option.id}
                    className="size-4 border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    disabled={disabled}
                    id={optionId}
                    name={inputId}
                    onChange={() => onChange(option.id)}
                    required={question.required}
                    type="radio"
                    value={option.id}
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
        )
      }

      case QUESTION_TYPE.MULTIPLE_CHOICE: {
        const options = optionsOf(config)
        const selection = asStringArray(value)
        return (
          <div className="space-y-1">
            {options.map((option) => {
              const optionId = `${inputId}-${option.id}`
              const checked = selection.includes(option.id)
              return (
                <label
                  className="flex items-center gap-2 text-sm"
                  htmlFor={optionId}
                  key={option.id}
                >
                  <input
                    checked={checked}
                    className="size-4 rounded border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    disabled={disabled}
                    id={optionId}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...selection, option.id]
                          : selection.filter((id) => id !== option.id)
                      )
                    }
                    type="checkbox"
                    value={option.id}
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
        )
      }

      case QUESTION_TYPE.SCALE: {
        const min = numberConfigValue(config, "min")
        const max = numberConfigValue(config, "max")
        const step = numberConfigValue(config, "step")
        return (
          <Input
            aria-describedby={describedBy}
            aria-invalid={fieldError ? true : undefined}
            aria-required={question.required || undefined}
            disabled={disabled}
            id={inputId}
            inputMode="numeric"
            max={max}
            min={min}
            onChange={(event) => onChange(event.target.value)}
            step={step}
            type="number"
            value={asText(value)}
          />
        )
      }

      case QUESTION_TYPE.NUMBER: {
        const min = numberConfigValue(config, "min")
        const max = numberConfigValue(config, "max")
        return (
          <Input
            aria-describedby={describedBy}
            aria-invalid={fieldError ? true : undefined}
            aria-required={question.required || undefined}
            disabled={disabled}
            id={inputId}
            inputMode="decimal"
            max={max}
            min={min}
            onChange={(event) => onChange(event.target.value)}
            type="number"
            value={asText(value)}
          />
        )
      }

      case QUESTION_TYPE.LONG_TEXT: {
        const maxLength = numberConfigValue(config, "maxLength")
        return (
          <textarea
            aria-describedby={describedBy}
            aria-invalid={fieldError ? true : undefined}
            aria-required={question.required || undefined}
            className="min-h-24 w-full min-w-0 rounded-md border border-input bg-input/30 px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            disabled={disabled}
            id={inputId}
            maxLength={maxLength}
            onChange={(event) => onChange(event.target.value)}
            value={asText(value)}
          />
        )
      }

      case QUESTION_TYPE.SHORT_TEXT: {
        const maxLength = numberConfigValue(config, "maxLength")
        return (
          <Input
            aria-describedby={describedBy}
            aria-invalid={fieldError ? true : undefined}
            aria-required={question.required || undefined}
            disabled={disabled}
            id={inputId}
            maxLength={maxLength}
            onChange={(event) => onChange(event.target.value)}
            type="text"
            value={asText(value)}
          />
        )
      }

      case QUESTION_TYPE.DATE:
        return (
          <Input
            aria-describedby={describedBy}
            aria-invalid={fieldError ? true : undefined}
            aria-required={question.required || undefined}
            disabled={disabled}
            id={inputId}
            onChange={(event) => onChange(event.target.value)}
            type="date"
            value={asText(value)}
          />
        )

      case QUESTION_TYPE.TIME:
        return (
          <Input
            aria-describedby={describedBy}
            aria-invalid={fieldError ? true : undefined}
            aria-required={question.required || undefined}
            disabled={disabled}
            id={inputId}
            onChange={(event) => onChange(event.target.value)}
            type="time"
            value={asText(value)}
          />
        )

      case QUESTION_TYPE.PHOTO:
      case QUESTION_TYPE.FILE:
        return (
          <UploadField
            accessToken={accessToken}
            active={uploadActive}
            describedById={describedBy}
            disabled={disabled}
            fieldError={fieldError}
            inputId={inputId}
            onChange={(objectKey) => onChange(objectKey)}
            questionId={question.id}
            questionnaireId={questionnaireId}
            required={question.required}
            value={asText(value)}
          />
        )

      default: {
        const exhaustiveCheck: never = question.type
        return exhaustiveCheck
      }
    }
  }
}

export default QuestionControl
