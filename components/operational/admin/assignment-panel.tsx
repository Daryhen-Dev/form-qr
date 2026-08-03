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
  type AssignmentDTO,
  type EmployeeBranchViewDTO,
  type UserDTO,
} from "@/lib/operational-api/contracts"
import {
  assignEmployee,
  getEmployeeBranch,
  listBranchEmployees,
} from "@/lib/operational-api/assignments"
import {
  clearOperationFieldIssue,
  createOperationStates,
  getOperation,
  isOperationPending,
  settleOperation,
  startOperation,
  type OperationStates,
} from "@/lib/operational-api/operation-state"
import { listUsers } from "@/lib/operational-api/users"
import { ROLE } from "@/lib/types"

/**
 * Employee-to-branch assignment panel.
 *
 * Available to both Administrador and Secretario (Requirement 3.5): lists the
 * branch's current assignments via `GET /api/v1/branches/:id/employees`,
 * consults an employee's current branch and history via
 * `GET /api/v1/users/:id/branch`, and submits a new assignment via
 * `POST /api/v1/branches/:id/employees`.
 *
 * A single protected assignment is pending at a time; HTTP 422 issues are
 * associated with the affected control while every other failure surfaces a
 * safe general message (Requirements 3.6, 3.7, 7.1, 7.5-7.8, 8.4, 9.3, 9.4).
 */

const ASSIGN_OPERATION = "assignment-create"

interface AssignmentPanelProps {
  readonly branchId: string
}

function fullName(user: UserDTO): string {
  return `${user.nombres} ${user.apellidos}`
}

export function AssignmentPanel({ branchId }: AssignmentPanelProps) {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""

  const [assignments, setAssignments] = useState<readonly AssignmentDTO[]>([])
  const [employees, setEmployees] = useState<readonly UserDTO[]>([])
  const [listMessage, setListMessage] = useState<string>()
  const [selectedUserId, setSelectedUserId] = useState("")
  const [employeeBranch, setEmployeeBranch] =
    useState<EmployeeBranchViewDTO>()
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const loadAssignments = useCallback(async () => {
    const result = await listBranchEmployees(accessToken, branchId)

    if (isProtectedSuccess(result)) {
      setAssignments(result.data)
      setListMessage(undefined)
      return
    }

    setListMessage(generalIssueMessage(result))
  }, [accessToken, branchId])

  useEffect(() => {
    let active = true

    async function loadInitialAssignments() {
      const result = await listBranchEmployees(accessToken, branchId)
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
  }, [accessToken, branchId])

  useEffect(() => {
    let active = true

    async function loadInitialEmployees() {
      const result = await listUsers(accessToken)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setEmployees(result.data.filter((user) => user.role === ROLE.EMPLEADO))
      }
    }

    void loadInitialEmployees()
    return () => {
      active = false
    }
  }, [accessToken])

  const assignOperation = getOperation(states, ASSIGN_OPERATION)
  const assignFeedback = operationFeedback(assignOperation)
  const assignPending = isOperationPending(states, ASSIGN_OPERATION)
  const userIdError = fieldIssueMessage(assignOperation.result, "userId")

  const employeeName = useCallback(
    (userId: string) => {
      const match = employees.find((user) => user.id === userId)
      return match === undefined ? userId : fullName(match)
    },
    [employees]
  )

  function selectEmployee(userId: string) {
    setSelectedUserId(userId)
    setEmployeeBranch(undefined)
    setStates((current) =>
      clearOperationFieldIssue(current, ASSIGN_OPERATION, "userId")
    )
  }

  async function handleConsultBranch() {
    if (selectedUserId === "") {
      return
    }

    const result = await getEmployeeBranch(accessToken, selectedUserId)
    if (isProtectedSuccess(result)) {
      setEmployeeBranch(result.data)
    }
  }

  async function handleAssign() {
    if (selectedUserId === "" || isOperationPending(states, ASSIGN_OPERATION)) {
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

    const result = await assignEmployee(accessToken, branchId, {
      userId: selectedUserId,
    })
    setStates((current) => settleOperation(current, ASSIGN_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setSelectedUserId("")
      setEmployeeBranch(undefined)
      await loadAssignments()
    }
  }

  return (
    <div
      aria-label="Asignación de empleados"
      className="min-w-0 space-y-4 rounded-lg border p-4"
      role="group"
    >
      <h2 className="text-lg font-semibold">Empleados de la sucursal</h2>

      <StatusRegion message={listMessage} tone="error" />

      <ul className="min-w-0 space-y-1">
        {assignments.length === 0 ? (
          <li className="text-sm text-muted-foreground">
            No hay empleados asignados.
          </li>
        ) : (
          assignments.map((assignment) => (
            <li
              key={assignment.id}
              className="truncate rounded-md border px-3 py-2 text-sm"
            >
              {employeeName(assignment.userId)}
            </li>
          ))
        )}
      </ul>

      <div className="space-y-2">
        <Label htmlFor="assignment-user">Empleado</Label>
        <select
          aria-describedby={userIdError ? "assignment-user-error" : undefined}
          aria-invalid={userIdError ? true : undefined}
          className="h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
          id="assignment-user"
          onChange={(event) => selectEmployee(event.target.value)}
          value={selectedUserId}
        >
          <option value="">Seleccione un empleado</option>
          {employees.map((user) => (
            <option key={user.id} value={user.id}>
              {fullName(user)}
            </option>
          ))}
        </select>
        {userIdError ? (
          <Alert
            aria-live="assertive"
            id="assignment-user-error"
            variant="destructive"
          >
            {userIdError}
          </Alert>
        ) : null}
      </div>

      {employeeBranch !== undefined ? (
        <div className="space-y-1 rounded-md border px-3 py-2 text-sm">
          <p>
            Sucursal actual:{" "}
            <span className="font-medium">
              {employeeBranch.branch?.name ?? "Sin asignación"}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {employeeBranch.history.length} registro(s) en el historial.
          </p>
        </div>
      ) : null}

      <StatusRegion message={assignFeedback.message} tone={assignFeedback.tone} />

      <div className="flex flex-wrap gap-2">
        <ActionActivation
          className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={assignPending || selectedUserId === ""}
          onActivate={() => void handleAssign()}
        >
          {assignPending ? "Asignando…" : "Asignar a la sucursal"}
        </ActionActivation>
        <ActionActivation
          className="inline-flex h-9 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={selectedUserId === ""}
          onActivate={() => void handleConsultBranch()}
        >
          Ver sucursal e historial
        </ActionActivation>
      </div>
    </div>
  )
}

export default AssignmentPanel
