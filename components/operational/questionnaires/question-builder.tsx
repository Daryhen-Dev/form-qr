"use client"

import { ActionActivation } from "@/components/operational/action-activation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { QuestionDraft } from "@/lib/operational-api/questionnaire-draft"
import { QUESTION_TYPE, type QuestionType } from "@/lib/types"

/**
 * Draft question set editor for a draft questionnaire version.
 *
 * Renders one editable control group per {@link QuestionDraft} and supports the
 * eleven question types with the configuration each one requires by the
 * existing API contract (Requirement 4.3): choice options, scale bounds, text
 * length, numeric bounds, and the object-key pattern for `photo`/`file`.
 *
 * The component is fully controlled: it never persists anything itself and only
 * emits the next ordered draft set through `onDraftsChange`. Array position is
 * kept as the source of truth for ordering — `order` mirrors the 1-based index
 * so the pure serializer produces contiguous `1..n` orders. Each control has an
 * accessible name and is activatable by keyboard and pointer (Requirements 9.1,
 * 9.2).
 */

interface ChoiceOption {
  readonly id: string
  readonly label: string
}

export interface QuestionBuilderProps {
  readonly drafts: readonly QuestionDraft[]
  readonly onDraftsChange: (drafts: readonly QuestionDraft[]) => void
  readonly disabled?: boolean
}

const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  [QUESTION_TYPE.BOOLEAN]: "Sí / No",
  [QUESTION_TYPE.SINGLE_CHOICE]: "Opción única",
  [QUESTION_TYPE.MULTIPLE_CHOICE]: "Opción múltiple",
  [QUESTION_TYPE.SCALE]: "Escala",
  [QUESTION_TYPE.SHORT_TEXT]: "Texto corto",
  [QUESTION_TYPE.LONG_TEXT]: "Texto largo",
  [QUESTION_TYPE.NUMBER]: "Número",
  [QUESTION_TYPE.DATE]: "Fecha",
  [QUESTION_TYPE.TIME]: "Hora",
  [QUESTION_TYPE.PHOTO]: "Fotografía",
  [QUESTION_TYPE.FILE]: "Archivo",
}

const QUESTION_TYPES = Object.values(QUESTION_TYPE)

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

/** Default, contract-valid configuration for a freshly selected type. */
function defaultConfig(type: QuestionType): Record<string, unknown> {
  switch (type) {
    case QUESTION_TYPE.SINGLE_CHOICE:
    case QUESTION_TYPE.MULTIPLE_CHOICE:
      return { options: [{ id: makeId("opcion"), label: "" }] }
    case QUESTION_TYPE.SCALE:
      return { min: 1, max: 5, step: 1 }
    case QUESTION_TYPE.PHOTO:
    case QUESTION_TYPE.FILE:
      return { objectKeyPattern: "" }
    default:
      return {}
  }
}

function createDraft(order: number): QuestionDraft {
  return {
    clientKey: makeId("pregunta"),
    order,
    type: QUESTION_TYPE.BOOLEAN,
    prompt: "",
    required: false,
    config: defaultConfig(QUESTION_TYPE.BOOLEAN),
  }
}

/** Re-derive the 1-based `order` for every draft from its array position. */
function withSequentialOrders(
  drafts: readonly QuestionDraft[]
): readonly QuestionDraft[] {
  return drafts.map((draft, index) => ({ ...draft, order: index + 1 }))
}

function optionsOf(config: Record<string, unknown>): ChoiceOption[] {
  const raw = config.options
  return Array.isArray(raw) ? (raw as ChoiceOption[]) : []
}

function numericConfigValue(
  config: Record<string, unknown>,
  key: string
): string {
  const value = config[key]
  return typeof value === "number" ? String(value) : ""
}

function stringConfigValue(
  config: Record<string, unknown>,
  key: string
): string {
  const value = config[key]
  return typeof value === "string" ? value : ""
}

export function QuestionBuilder({
  drafts,
  onDraftsChange,
  disabled = false,
}: QuestionBuilderProps) {
  function replaceDraft(index: number, next: QuestionDraft) {
    onDraftsChange(
      withSequentialOrders(
        drafts.map((draft, position) => (position === index ? next : draft))
      )
    )
  }

  function updateConfig(index: number, config: Record<string, unknown>) {
    replaceDraft(index, { ...drafts[index], config })
  }

  function addQuestion() {
    onDraftsChange(
      withSequentialOrders([...drafts, createDraft(drafts.length + 1)])
    )
  }

  function removeQuestion(index: number) {
    onDraftsChange(
      withSequentialOrders(drafts.filter((_, position) => position !== index))
    )
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= drafts.length) {
      return
    }
    const next = [...drafts]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onDraftsChange(withSequentialOrders(next))
  }

  function changeType(index: number, type: QuestionType) {
    replaceDraft(index, {
      ...drafts[index],
      type,
      config: defaultConfig(type),
    })
  }

  return (
    <div className="min-w-0 space-y-4" role="group" aria-label="Preguntas">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Preguntas</h3>
        <ActionActivation
          className="inline-flex h-8 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={disabled}
          onActivate={addQuestion}
        >
          Agregar pregunta
        </ActionActivation>
      </div>

      {drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta versión no tiene preguntas. Agregue al menos una.
        </p>
      ) : null}

      <ol className="min-w-0 space-y-4">
        {drafts.map((draft, index) => {
          const promptId = `question-${draft.clientKey}-prompt`
          const typeId = `question-${draft.clientKey}-type`
          const requiredId = `question-${draft.clientKey}-required`

          return (
            <li
              key={draft.clientKey}
              className="min-w-0 space-y-3 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  Pregunta {index + 1}
                </span>
                <div className="flex flex-wrap gap-1">
                  <ActionActivation
                    aria-label={`Subir pregunta ${index + 1}`}
                    className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    disabled={disabled || index === 0}
                    onActivate={() => moveQuestion(index, -1)}
                  >
                    Subir
                  </ActionActivation>
                  <ActionActivation
                    aria-label={`Bajar pregunta ${index + 1}`}
                    className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    disabled={disabled || index === drafts.length - 1}
                    onActivate={() => moveQuestion(index, 1)}
                  >
                    Bajar
                  </ActionActivation>
                  <ActionActivation
                    aria-label={`Eliminar pregunta ${index + 1}`}
                    className="inline-flex h-8 items-center rounded-4xl bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-[3px] focus-visible:ring-destructive/20 disabled:opacity-50"
                    disabled={disabled}
                    onActivate={() => removeQuestion(index)}
                  >
                    Eliminar
                  </ActionActivation>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={promptId}>Enunciado</Label>
                <Input
                  disabled={disabled}
                  id={promptId}
                  onChange={(event) =>
                    replaceDraft(index, {
                      ...draft,
                      prompt: event.target.value,
                    })
                  }
                  value={draft.prompt}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={typeId}>Tipo</Label>
                <select
                  className="h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                  disabled={disabled}
                  id={typeId}
                  onChange={(event) =>
                    changeType(index, event.target.value as QuestionType)
                  }
                  value={draft.type}
                >
                  {QUESTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {QUESTION_TYPE_LABEL[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  checked={draft.required}
                  className="size-4 rounded border-input focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                  disabled={disabled}
                  id={requiredId}
                  onChange={(event) =>
                    replaceDraft(index, {
                      ...draft,
                      required: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                <Label htmlFor={requiredId}>Obligatoria</Label>
              </div>

              <QuestionConfigEditor
                clientKey={draft.clientKey}
                config={draft.config}
                disabled={disabled}
                onConfigChange={(config) => updateConfig(index, config)}
                type={draft.type}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

interface QuestionConfigEditorProps {
  readonly clientKey: string
  readonly type: QuestionType
  readonly config: Record<string, unknown>
  readonly disabled: boolean
  readonly onConfigChange: (config: Record<string, unknown>) => void
}

function QuestionConfigEditor({
  clientKey,
  type,
  config,
  disabled,
  onConfigChange,
}: QuestionConfigEditorProps) {
  if (
    type === QUESTION_TYPE.SINGLE_CHOICE ||
    type === QUESTION_TYPE.MULTIPLE_CHOICE
  ) {
    return (
      <ChoiceConfigEditor
        clientKey={clientKey}
        config={config}
        disabled={disabled}
        onConfigChange={onConfigChange}
        withSelectionBounds={type === QUESTION_TYPE.MULTIPLE_CHOICE}
      />
    )
  }

  if (type === QUESTION_TYPE.SCALE) {
    return (
      <ScaleConfigEditor
        clientKey={clientKey}
        config={config}
        disabled={disabled}
        onConfigChange={onConfigChange}
      />
    )
  }

  if (type === QUESTION_TYPE.SHORT_TEXT || type === QUESTION_TYPE.LONG_TEXT) {
    return (
      <NumberConfigField
        config={config}
        configKey="maxLength"
        disabled={disabled}
        fieldId={`question-${clientKey}-maxlength`}
        label="Longitud máxima"
        onConfigChange={onConfigChange}
      />
    )
  }

  if (type === QUESTION_TYPE.NUMBER) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <NumberConfigField
          config={config}
          configKey="min"
          disabled={disabled}
          fieldId={`question-${clientKey}-min`}
          label="Mínimo"
          onConfigChange={onConfigChange}
        />
        <NumberConfigField
          config={config}
          configKey="max"
          disabled={disabled}
          fieldId={`question-${clientKey}-max`}
          label="Máximo"
          onConfigChange={onConfigChange}
        />
      </div>
    )
  }

  if (type === QUESTION_TYPE.PHOTO || type === QUESTION_TYPE.FILE) {
    const patternId = `question-${clientKey}-pattern`
    return (
      <div className="space-y-2">
        <Label htmlFor={patternId}>Patrón de clave de objeto</Label>
        <Input
          disabled={disabled}
          id={patternId}
          onChange={(event) =>
            onConfigChange({ ...config, objectKeyPattern: event.target.value })
          }
          value={stringConfigValue(config, "objectKeyPattern")}
        />
      </div>
    )
  }

  return null
}

interface ChoiceConfigEditorProps {
  readonly clientKey: string
  readonly config: Record<string, unknown>
  readonly disabled: boolean
  readonly withSelectionBounds: boolean
  readonly onConfigChange: (config: Record<string, unknown>) => void
}

function ChoiceConfigEditor({
  clientKey,
  config,
  disabled,
  withSelectionBounds,
  onConfigChange,
}: ChoiceConfigEditorProps) {
  const options = optionsOf(config)

  function updateOptions(next: ChoiceOption[]) {
    onConfigChange({ ...config, options: next })
  }

  return (
    <div className="space-y-2" role="group" aria-label="Opciones">
      <span className="text-sm font-medium">Opciones</span>
      <ul className="space-y-2">
        {options.map((option, optionIndex) => {
          const optionId = `question-${clientKey}-option-${option.id}`
          return (
            <li key={option.id} className="flex items-center gap-2">
              <Label className="sr-only" htmlFor={optionId}>
                Opción {optionIndex + 1}
              </Label>
              <Input
                disabled={disabled}
                id={optionId}
                onChange={(event) =>
                  updateOptions(
                    options.map((current, position) =>
                      position === optionIndex
                        ? { ...current, label: event.target.value }
                        : current
                    )
                  )
                }
                value={option.label}
              />
              <ActionActivation
                aria-label={`Eliminar opción ${optionIndex + 1}`}
                className="inline-flex h-8 shrink-0 items-center rounded-4xl bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-[3px] focus-visible:ring-destructive/20 disabled:opacity-50"
                disabled={disabled || options.length <= 1}
                onActivate={() =>
                  updateOptions(
                    options.filter((_, position) => position !== optionIndex)
                  )
                }
              >
                Quitar
              </ActionActivation>
            </li>
          )
        })}
      </ul>
      <ActionActivation
        className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        disabled={disabled}
        onActivate={() =>
          updateOptions([...options, { id: makeId("opcion"), label: "" }])
        }
      >
        Agregar opción
      </ActionActivation>

      {withSelectionBounds ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberConfigField
            config={config}
            configKey="minSelected"
            disabled={disabled}
            fieldId={`question-${clientKey}-min-selected`}
            label="Mínimo seleccionable"
            onConfigChange={onConfigChange}
          />
          <NumberConfigField
            config={config}
            configKey="maxSelected"
            disabled={disabled}
            fieldId={`question-${clientKey}-max-selected`}
            label="Máximo seleccionable"
            onConfigChange={onConfigChange}
          />
        </div>
      ) : null}
    </div>
  )
}

interface ScaleConfigEditorProps {
  readonly clientKey: string
  readonly config: Record<string, unknown>
  readonly disabled: boolean
  readonly onConfigChange: (config: Record<string, unknown>) => void
}

function ScaleConfigEditor({
  clientKey,
  config,
  disabled,
  onConfigChange,
}: ScaleConfigEditorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <NumberConfigField
        config={config}
        configKey="min"
        disabled={disabled}
        fieldId={`question-${clientKey}-scale-min`}
        label="Mínimo"
        onConfigChange={onConfigChange}
      />
      <NumberConfigField
        config={config}
        configKey="max"
        disabled={disabled}
        fieldId={`question-${clientKey}-scale-max`}
        label="Máximo"
        onConfigChange={onConfigChange}
      />
      <NumberConfigField
        config={config}
        configKey="step"
        disabled={disabled}
        fieldId={`question-${clientKey}-scale-step`}
        label="Paso"
        onConfigChange={onConfigChange}
      />
    </div>
  )
}

interface NumberConfigFieldProps {
  readonly fieldId: string
  readonly label: string
  readonly config: Record<string, unknown>
  readonly configKey: string
  readonly disabled: boolean
  readonly onConfigChange: (config: Record<string, unknown>) => void
}

function NumberConfigField({
  fieldId,
  label,
  config,
  configKey,
  disabled,
  onConfigChange,
}: NumberConfigFieldProps) {
  function handleChange(raw: string) {
    const next = { ...config }
    if (raw.trim() === "") {
      delete next[configKey]
    } else {
      const parsed = Number(raw)
      if (Number.isNaN(parsed)) {
        return
      }
      next[configKey] = parsed
    }
    onConfigChange(next)
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        disabled={disabled}
        id={fieldId}
        inputMode="numeric"
        onChange={(event) => handleChange(event.target.value)}
        type="number"
        value={numericConfigValue(config, configKey)}
      />
    </div>
  )
}

export default QuestionBuilder
