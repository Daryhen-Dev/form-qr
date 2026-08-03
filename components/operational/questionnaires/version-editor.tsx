"use client"

import { useCallback, useEffect, useState } from "react"

import { useAccess } from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import {
  generalIssueMessage,
  operationFeedback,
} from "@/components/operational/admin/operation-feedback"
import { QuestionBuilder } from "@/components/operational/questionnaires/question-builder"
import {
  isProtectedSuccess,
  type QuestionDTO,
  type QuestionnaireVersionDTO,
} from "@/lib/operational-api/contracts"
import {
  createOperationStates,
  getOperation,
  isOperationPending,
  settleOperation,
  startOperation,
  type OperationStates,
} from "@/lib/operational-api/operation-state"
import type { QuestionDraft } from "@/lib/operational-api/questionnaire-draft"
import { serializeQuestionDraftsForPatch } from "@/lib/operational-api/questionnaire-draft"
import {
  createVersion,
  getVersion,
  listVersions,
  publishVersion,
  setVersionQuestions,
  type QuestionnaireVersionWithQuestions,
} from "@/lib/operational-api/questionnaires"
import { VERSION_STATUS } from "@/lib/types"

/**
 * Version editor for a single questionnaire.
 *
 * Creates a draft version via `POST .../versions`, lists versions via
 * `GET .../versions`, and loads a version and its ordered questions via
 * `GET .../versions/:versionId` (Requirement 4.2). A draft version is saved by
 * sending the full ordered question set through
 * `PATCH .../versions/:versionId` — the serializer strips `clientKey`,
 * normalizes orders to `1..n`, and preserves each type and config
 * (Requirement 4.3).
 *
 * Publishing sends `POST .../versions/:versionId/publish` and updates the
 * displayed status EXCLUSIVELY from the received result — never optimistically
 * (Requirement 4.4). A published version is presented read-only.
 *
 * A single protected operation is pending at a time; failures surface a safe
 * general message (Requirements 4.7, 7.1, 7.x, 9.3, 9.4).
 */

const CREATE_OPERATION = "version-create"
const SAVE_OPERATION = "version-save"
const PUBLISH_OPERATION = "version-publish"

interface VersionEditorProps {
  readonly questionnaireId: string
}

function makeClientKey(): string {
  return `pregunta-${Math.random().toString(36).slice(2, 10)}`
}

/** Map a persisted question into an in-memory, UI-editable draft. */
function toDraft(question: QuestionDTO): QuestionDraft {
  return {
    clientKey: makeClientKey(),
    order: question.order,
    type: question.type,
    prompt: question.prompt,
    required: question.required,
    config: { ...question.config },
  }
}

function isDraftVersion(version: QuestionnaireVersionDTO | undefined): boolean {
  return version?.status === VERSION_STATUS.DRAFT
}

export function VersionEditor({ questionnaireId }: VersionEditorProps) {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""

  const [versions, setVersions] = useState<readonly QuestionnaireVersionDTO[]>(
    []
  )
  const [listMessage, setListMessage] = useState<string>()
  const [selected, setSelected] = useState<QuestionnaireVersionDTO>()
  const [drafts, setDrafts] = useState<readonly QuestionDraft[]>([])
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const loadVersions = useCallback(async () => {
    const result = await listVersions(accessToken, questionnaireId)

    if (isProtectedSuccess(result)) {
      setVersions(result.data)
      setListMessage(undefined)
      return
    }

    setListMessage(generalIssueMessage(result))
  }, [accessToken, questionnaireId])

  useEffect(() => {
    let active = true

    async function loadInitialVersions() {
      const result = await listVersions(accessToken, questionnaireId)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setVersions(result.data)
        setListMessage(undefined)
        return
      }

      setListMessage(generalIssueMessage(result))
    }

    void loadInitialVersions()
    return () => {
      active = false
    }
  }, [accessToken, questionnaireId])

  const createOperation = getOperation(states, CREATE_OPERATION)
  const saveOperation = getOperation(states, SAVE_OPERATION)
  const publishOperation = getOperation(states, PUBLISH_OPERATION)
  const createFeedback = operationFeedback(createOperation)
  const saveFeedback = operationFeedback(saveOperation)
  const publishFeedback = operationFeedback(publishOperation)
  const createPending = isOperationPending(states, CREATE_OPERATION)
  const savePending = isOperationPending(states, SAVE_OPERATION)
  const publishPending = isOperationPending(states, PUBLISH_OPERATION)

  const editable = isDraftVersion(selected)

  /** Apply a loaded version-with-questions to the selection and draft set. */
  function applyLoadedVersion(version: QuestionnaireVersionWithQuestions) {
    setSelected(version)
    setDrafts(version.questions.map(toDraft))
  }

  async function handleSelectVersion(versionId: string) {
    const result = await getVersion(accessToken, questionnaireId, versionId)

    if (isProtectedSuccess(result)) {
      applyLoadedVersion(result.data)
      return
    }

    setListMessage(generalIssueMessage(result))
  }

  async function handleCreateVersion() {
    if (isOperationPending(states, CREATE_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      CREATE_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const result = await createVersion(accessToken, questionnaireId)
    setStates((current) => settleOperation(current, CREATE_OPERATION, result))

    if (isProtectedSuccess(result)) {
      await loadVersions()
      await handleSelectVersion(result.data.id)
    }
  }

  async function handleSaveQuestions() {
    if (selected === undefined || !editable) {
      return
    }
    if (isOperationPending(states, SAVE_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      SAVE_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const result = await setVersionQuestions(
      accessToken,
      questionnaireId,
      selected.id,
      serializeQuestionDraftsForPatch(drafts)
    )
    setStates((current) => settleOperation(current, SAVE_OPERATION, result))

    if (isProtectedSuccess(result)) {
      // Reflect the persisted, ordered question set returned by the API.
      applyLoadedVersion(result.data)
    }
  }

  async function handlePublish() {
    if (selected === undefined || !editable) {
      return
    }
    if (isOperationPending(states, PUBLISH_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      PUBLISH_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const result = await publishVersion(accessToken, questionnaireId, selected.id)
    setStates((current) => settleOperation(current, PUBLISH_OPERATION, result))

    if (isProtectedSuccess(result)) {
      // CRITICAL: the displayed status comes ONLY from the API result, never
      // from an optimistic local guess (Requirement 4.4).
      setSelected(result.data)
      setVersions((current) =>
        current.map((version) =>
          version.id === result.data.id ? result.data : version
        )
      )
    }
  }

  return (
    <div
      aria-label="Versiones del cuestionario"
      className="min-w-0 space-y-4 rounded-lg border p-4"
      role="group"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Versiones</h3>
        <ActionActivation
          className="inline-flex h-8 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={createPending}
          onActivate={() => void handleCreateVersion()}
        >
          {createPending ? "Creando…" : "Nueva versión borrador"}
        </ActionActivation>
      </div>

      <StatusRegion message={listMessage} tone="error" />
      <StatusRegion message={createFeedback.message} tone={createFeedback.tone} />

      <ul className="min-w-0 space-y-2">
        {versions.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No hay versiones. Cree una versión borrador.
          </li>
        ) : (
          versions.map((version) => (
            <li
              key={version.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <span className="truncate text-sm">
                Versión {version.versionNumber} ·{" "}
                {version.status === VERSION_STATUS.PUBLISHED
                  ? "Publicada"
                  : "Borrador"}
              </span>
              <ActionActivation
                aria-label={`Abrir versión ${version.versionNumber}`}
                aria-current={selected?.id === version.id ? "true" : undefined}
                className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                onActivate={() => void handleSelectVersion(version.id)}
              >
                Abrir
              </ActionActivation>
            </li>
          ))
        )}
      </ul>

      {selected !== undefined ? (
        <div className="min-w-0 space-y-4 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              Versión {selected.versionNumber} ·{" "}
              {selected.status === VERSION_STATUS.PUBLISHED
                ? "Publicada"
                : "Borrador"}
            </h4>
          </div>

          {editable ? (
            <p className="text-sm text-muted-foreground">
              Edite las preguntas y guarde el conjunto completo. Publique cuando
              la versión esté lista.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Esta versión está publicada y no puede modificarse.
            </p>
          )}

          <QuestionBuilder
            disabled={!editable}
            drafts={drafts}
            onDraftsChange={setDrafts}
          />

          {editable ? (
            <>
              <StatusRegion
                message={saveFeedback.message}
                tone={saveFeedback.tone}
              />
              <StatusRegion
                message={publishFeedback.message}
                tone={publishFeedback.tone}
              />

              <div className="flex flex-wrap gap-2">
                <ActionActivation
                  className="inline-flex h-9 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                  disabled={savePending || publishPending}
                  onActivate={() => void handleSaveQuestions()}
                >
                  {savePending ? "Guardando…" : "Guardar preguntas"}
                </ActionActivation>
                <ActionActivation
                  className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                  disabled={savePending || publishPending}
                  onActivate={() => void handlePublish()}
                >
                  {publishPending ? "Publicando…" : "Publicar versión"}
                </ActionActivation>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default VersionEditor
