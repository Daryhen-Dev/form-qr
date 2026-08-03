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
import { Alert } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import {
  isProtectedSuccess,
  type BranchDTO,
  type QuestionnaireBranchDTO,
} from "@/lib/operational-api/contracts"
import { listBranches } from "@/lib/operational-api/branches"
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
  assignQuestionnaireBranch,
  listQuestionnaireBranches,
  unassignQuestionnaireBranch,
} from "@/lib/operational-api/questionnaires"

/**
 * Questionnaire-to-branch assignment panel.
 *
 * Lists a questionnaire's branch assignments via
 * `GET /api/v1/questionnaires/:id/branches`, creates one via
 * `POST /api/v1/questionnaires/:id/branches`, and removes one via
 * `DELETE /api/v1/questionnaires/:id/branches/:branchId` (Requirement 4.5).
 *
 * A single protected assignment/removal is pending at a time; HTTP 422 issues
 * are associated with the affected control via `aria-invalid` /
 * `aria-describedby`, while every other failure surfaces a single safe general
 * message (Requirements 4.7, 7.1, 7.5-7.8, 8.4, 9.3, 9.4).
 */

const ASSIGN_OPERATION = "questionnaire-branch-assign"
const REMOVE_OPERATION = "questionnaire-branch-remove"

interface BranchAssignmentPanelProps {
  readonly questionnaireId: string
}

export function BranchAssignmentPanel({
  questionnaireId,
}: BranchAssignmentPanelProps) {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""

  const [assignments, setAssignments] = useState<
    readonly QuestionnaireBranchDTO[]
  >([])
  const [branches, setBranches] = useState<readonly BranchDTO[]>([])
  const [listMessage, setListMessage] = useState<string>()
  const [selectedBranchId, setSelectedBranchId] = useState("")
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const loadAssignments = useCallback(async () => {
    const result = await listQuestionnaireBranches(accessToken, questionnaireId)

    if (isProtectedSuccess(result)) {
      setAssignments(result.data)
      setListMessage(undefined)
      return
    }

    setListMessage(generalIssueMessage(result))
  }, [accessToken, questionnaireId])

  useEffect(() => {
    let active = true

    async function loadInitialAssignments() {
      const result = await listQuestionnaireBranches(accessToken, questionnaireId)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setAssignments(result.data)
        setListMessage(undefined)
        return
      }

      setListMessage(generalIssueMessage(result))
    }

    void loadInitialAssignments()
    return () => {
      active = false
    }
  }, [accessToken, questionnaireId])

  useEffect(() => {
    let active = true

    async function loadInitialBranches() {
      const result = await listBranches(accessToken)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setBranches(result.data)
      }
    }

    void loadInitialBranches()
    return () => {
      active = false
    }
  }, [accessToken])

  const assignOperation = getOperation(states, ASSIGN_OPERATION)
  const removeOperation = getOperation(states, REMOVE_OPERATION)
  const assignFeedback = operationFeedback(assignOperation)
  const removeFeedback = operationFeedback(removeOperation)
  const assignPending = isOperationPending(states, ASSIGN_OPERATION)
  const branchIdError = fieldIssueMessage(assignOperation.result, "branchId")

  const branchName = useCallback(
    (id: string) => branches.find((branch) => branch.id === id)?.name ?? id,
    [branches]
  )

  function selectBranch(branchId: string) {
    setSelectedBranchId(branchId)
    setStates((current) =>
      clearOperationFieldIssue(current, ASSIGN_OPERATION, "branchId")
    )
  }

  async function handleAssign() {
    if (selectedBranchId === "" || isOperationPending(states, ASSIGN_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      ASSIGN_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const result = await assignQuestionnaireBranch(accessToken, questionnaireId, {
      branchId: selectedBranchId,
    })
    setStates((current) => settleOperation(current, ASSIGN_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setSelectedBranchId("")
      await loadAssignments()
    }
  }

  async function handleRemove(assignment: QuestionnaireBranchDTO) {
    if (isOperationPending(states, REMOVE_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      REMOVE_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    const result = await unassignQuestionnaireBranch(
      accessToken,
      questionnaireId,
      assignment.branchId
    )
    setStates((current) => settleOperation(current, REMOVE_OPERATION, result))

    if (isProtectedSuccess(result)) {
      await loadAssignments()
    }
  }

  const availableBranches = branches.filter(
    (branch) =>
      !assignments.some((assignment) => assignment.branchId === branch.id)
  )

  return (
    <div
      aria-label="Asignaciones de sucursal"
      className="min-w-0 space-y-4 rounded-lg border p-4"
      role="group"
    >
      <h3 className="text-base font-semibold">Sucursales asignadas</h3>

      <StatusRegion message={listMessage} tone="error" />
      <StatusRegion message={removeFeedback.message} tone={removeFeedback.tone} />

      <ul className="min-w-0 space-y-2">
        {assignments.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No hay sucursales asignadas.
          </li>
        ) : (
          assignments.map((assignment) => (
            <li
              key={assignment.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <span className="truncate text-sm">
                {branchName(assignment.branchId)}
              </span>
              <ActionActivation
                aria-label={`Quitar sucursal ${branchName(assignment.branchId)}`}
                className="inline-flex h-8 items-center rounded-4xl bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-[3px] focus-visible:ring-destructive/20 disabled:opacity-50"
                disabled={isOperationPending(states, REMOVE_OPERATION)}
                onActivate={() => void handleRemove(assignment)}
              >
                Quitar
              </ActionActivation>
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2">
        <Label htmlFor="questionnaire-branch">Sucursal</Label>
        <select
          aria-describedby={
            branchIdError ? "questionnaire-branch-error" : undefined
          }
          aria-invalid={branchIdError ? true : undefined}
          className="h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          id="questionnaire-branch"
          onChange={(event) => selectBranch(event.target.value)}
          value={selectedBranchId}
        >
          <option value="">Seleccione una sucursal</option>
          {availableBranches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        {branchIdError ? (
          <Alert
            aria-live="assertive"
            id="questionnaire-branch-error"
            variant="destructive"
          >
            {branchIdError}
          </Alert>
        ) : null}
      </div>

      <StatusRegion message={assignFeedback.message} tone={assignFeedback.tone} />

      <div className="flex flex-wrap gap-2">
        <ActionActivation
          className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={assignPending || selectedBranchId === ""}
          onActivate={() => void handleAssign()}
        >
          {assignPending ? "Asignando…" : "Asignar sucursal"}
        </ActionActivation>
      </div>
    </div>
  )
}

export default BranchAssignmentPanel
