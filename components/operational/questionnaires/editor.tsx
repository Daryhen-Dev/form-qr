"use client"

import { useCallback, useEffect, useState } from "react"

import { useAccess } from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import {
  fieldIssueMessage,
  generalIssueMessage,
  operationFeedback,
} from "@/components/operational/admin/operation-feedback"
import { BranchAssignmentPanel } from "@/components/operational/questionnaires/branch-assignment-panel"
import { QrPanel } from "@/components/operational/questionnaires/qr-panel"
import { VersionEditor } from "@/components/operational/questionnaires/version-editor"
import { Alert } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  isProtectedSuccess,
  type CreateQuestionnaireRequest,
  type QuestionnaireDTO,
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
  createQuestionnaire,
  deleteQuestionnaire,
  listQuestionnaires,
  updateQuestionnaire,
} from "@/lib/operational-api/questionnaires"

/**
 * Questionnaires management surface.
 *
 * Lists questionnaires and offers a create/edit detail form plus deactivation,
 * wired to the existing `/api/v1/questionnaires` contracts (Requirement 4.1).
 * Selecting a questionnaire opens its detail area, where its versions, branch
 * assignments, and QR are composed inline as embedded panels within the single
 * authorized `/operaciones/cuestionarios` surface (Requirements 4.2-4.6).
 *
 * HTTP 422 issues are associated with the affected control via `aria-invalid` /
 * `aria-describedby`; every other failure surfaces a single safe general
 * message through `StatusRegion` (Requirements 4.7, 7.x, 8.4, 9.3, 9.4).
 */

const FORM_OPERATION = "questionnaire-form"
const DELETE_OPERATION = "questionnaire-delete"

const QUESTIONNAIRE_FORM_MODE = {
  CREATE: "create",
  EDIT: "edit",
} as const

type QuestionnaireFormMode =
  (typeof QUESTIONNAIRE_FORM_MODE)[keyof typeof QUESTIONNAIRE_FORM_MODE]

interface QuestionnaireFormState {
  readonly mode: QuestionnaireFormMode
  readonly id: string | null
  readonly title: string
  readonly description: string
}

function emptyCreateForm(): QuestionnaireFormState {
  return {
    mode: QUESTIONNAIRE_FORM_MODE.CREATE,
    id: null,
    title: "",
    description: "",
  }
}

function editFormFor(questionnaire: QuestionnaireDTO): QuestionnaireFormState {
  return {
    mode: QUESTIONNAIRE_FORM_MODE.EDIT,
    id: questionnaire.id,
    title: questionnaire.title,
    description: questionnaire.description ?? "",
  }
}

function buildBody(form: QuestionnaireFormState): CreateQuestionnaireRequest {
  const body: CreateQuestionnaireRequest = { title: form.title }
  const description = form.description.trim()

  if (description.length > 0) {
    body.description = description
  }

  return body
}

export function QuestionnaireEditor() {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""

  const [questionnaires, setQuestionnaires] = useState<
    readonly QuestionnaireDTO[]
  >([])
  const [listMessage, setListMessage] = useState<string>()
  const [form, setForm] = useState<QuestionnaireFormState | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const loadQuestionnaires = useCallback(async () => {
    const result = await listQuestionnaires(accessToken)

    if (isProtectedSuccess(result)) {
      setQuestionnaires(result.data)
      setListMessage(undefined)
      return
    }

    setListMessage(generalIssueMessage(result))
  }, [accessToken])

  useEffect(() => {
    let active = true

    async function loadInitialQuestionnaires() {
      const result = await listQuestionnaires(accessToken)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setQuestionnaires(result.data)
        setListMessage(undefined)
        return
      }

      setListMessage(generalIssueMessage(result))
    }

    void loadInitialQuestionnaires()
    return () => {
      active = false
    }
  }, [accessToken])

  const formOperation = getOperation(states, FORM_OPERATION)
  const deleteOperation = getOperation(states, DELETE_OPERATION)
  const formFeedback = operationFeedback(formOperation)
  const deleteFeedback = operationFeedback(deleteOperation)
  const formPending = isOperationPending(states, FORM_OPERATION)

  const titleError = fieldIssueMessage(formOperation.result, "title")
  const descriptionError = fieldIssueMessage(formOperation.result, "description")
  const isCreate = form?.mode === QUESTIONNAIRE_FORM_MODE.CREATE

  const selected =
    selectedId === null
      ? undefined
      : questionnaires.find((questionnaire) => questionnaire.id === selectedId)

  function updateField(field: "title" | "description", value: string) {
    setForm((current) =>
      current === null ? current : { ...current, [field]: value }
    )
    setStates((current) =>
      clearOperationFieldIssue(current, FORM_OPERATION, field)
    )
  }

  async function handleSubmit() {
    if (form === null || isOperationPending(states, FORM_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      FORM_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const body = buildBody(form)
    const result =
      form.mode === QUESTIONNAIRE_FORM_MODE.CREATE
        ? await createQuestionnaire(accessToken, body)
        : await updateQuestionnaire(accessToken, form.id ?? "", body)

    setStates((current) => settleOperation(current, FORM_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setForm(null)
      await loadQuestionnaires()
    }
  }

  async function handleDelete(questionnaire: QuestionnaireDTO) {
    if (isOperationPending(states, DELETE_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      DELETE_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const result = await deleteQuestionnaire(accessToken, questionnaire.id)
    setStates((current) => settleOperation(current, DELETE_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setForm((current) => (current?.id === questionnaire.id ? null : current))
      setSelectedId((current) =>
        current === questionnaire.id ? null : current
      )
      await loadQuestionnaires()
    }
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Cuestionarios
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Prepare cuestionarios, gestione sus versiones y publique para
          distribuirlos por QR.
        </p>
      </header>

      <StatusRegion message={listMessage} tone="error" />
      <StatusRegion message={deleteFeedback.message} tone={deleteFeedback.tone} />

      <div className="flex flex-wrap gap-2">
        <ActionActivation
          className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          onActivate={() => setForm(emptyCreateForm())}
        >
          Nuevo cuestionario
        </ActionActivation>
      </div>

      <ul className="min-w-0 space-y-2">
        {questionnaires.map((questionnaire) => (
          <li
            key={questionnaire.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {questionnaire.title}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {questionnaire.description ?? "Sin descripción"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionActivation
                aria-current={
                  selectedId === questionnaire.id ? "true" : undefined
                }
                className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                onActivate={() =>
                  setSelectedId((current) =>
                    current === questionnaire.id ? null : questionnaire.id
                  )
                }
              >
                {selectedId === questionnaire.id ? "Cerrar" : "Gestionar"}
              </ActionActivation>
              <ActionActivation
                className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                onActivate={() => setForm(editFormFor(questionnaire))}
              >
                Editar
              </ActionActivation>
              <ActionActivation
                className="inline-flex h-8 items-center rounded-4xl bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-[3px] focus-visible:ring-destructive/20 disabled:opacity-50"
                disabled={isOperationPending(states, DELETE_OPERATION)}
                onActivate={() => void handleDelete(questionnaire)}
              >
                Desactivar
              </ActionActivation>
            </div>
          </li>
        ))}
      </ul>

      {form !== null ? (
        <div
          aria-label={isCreate ? "Crear cuestionario" : "Editar cuestionario"}
          className="min-w-0 space-y-4 rounded-lg border p-4"
          role="group"
        >
          <h2 className="text-lg font-semibold">
            {isCreate ? "Nuevo cuestionario" : "Editar cuestionario"}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="questionnaire-title">Título</Label>
            <Input
              aria-describedby={
                titleError ? "questionnaire-title-error" : undefined
              }
              aria-invalid={titleError ? true : undefined}
              id="questionnaire-title"
              onChange={(event) => updateField("title", event.target.value)}
              value={form.title}
            />
            {titleError ? (
              <Alert
                aria-live="assertive"
                id="questionnaire-title-error"
                variant="destructive"
              >
                {titleError}
              </Alert>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="questionnaire-description">Descripción</Label>
            <Input
              aria-describedby={
                descriptionError ? "questionnaire-description-error" : undefined
              }
              aria-invalid={descriptionError ? true : undefined}
              id="questionnaire-description"
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              value={form.description}
            />
            {descriptionError ? (
              <Alert
                aria-live="assertive"
                id="questionnaire-description-error"
                variant="destructive"
              >
                {descriptionError}
              </Alert>
            ) : null}
          </div>

          <StatusRegion message={formFeedback.message} tone={formFeedback.tone} />

          <div className="flex flex-wrap gap-2">
            <ActionActivation
              className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              disabled={formPending}
              onActivate={() => void handleSubmit()}
            >
              {formPending ? "Guardando…" : "Guardar"}
            </ActionActivation>
            <ActionActivation
              className="inline-flex h-9 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
              disabled={formPending}
              onActivate={() => setForm(null)}
            >
              Cancelar
            </ActionActivation>
          </div>
        </div>
      ) : null}

      {selected !== undefined ? (
        <div
          aria-label={`Gestión del cuestionario ${selected.title}`}
          className="min-w-0 space-y-4"
          role="group"
        >
          <h2 className="text-lg font-semibold">{selected.title}</h2>
          <VersionEditor key={selected.id} questionnaireId={selected.id} />
          <BranchAssignmentPanel key={`${selected.id}-branches`} questionnaireId={selected.id} />
          <QrPanel key={`${selected.id}-qr`} questionnaireId={selected.id} />
        </div>
      ) : null}
    </section>
  )
}

export default QuestionnaireEditor
