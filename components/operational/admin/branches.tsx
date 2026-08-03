"use client"

import { useCallback, useEffect, useState } from "react"

import {
  ACCESS_ROLE,
  useAccess,
  type AccessRole,
} from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import { AssignmentPanel } from "@/components/operational/admin/assignment-panel"
import {
  fieldIssueMessage,
  generalIssueMessage,
  operationFeedback,
} from "@/components/operational/admin/operation-feedback"
import { Alert } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  isProtectedSuccess,
  type BranchDTO,
  type CreateBranchRequest,
} from "@/lib/operational-api/contracts"
import {
  createBranch,
  deleteBranch,
  listBranches,
  updateBranch,
} from "@/lib/operational-api/branches"
import {
  clearOperationFieldIssue,
  createOperationStates,
  getOperation,
  isOperationPending,
  settleOperation,
  startOperation,
  type OperationStates,
} from "@/lib/operational-api/operation-state"

/**
 * Branches administration surface.
 *
 * An Administrador may list, create, update, and deactivate branches
 * (Requirement 3.3). A Secretario may only consult branches: the create, edit,
 * and deactivate controls stay disabled (Requirement 3.4). Both roles may open
 * a branch's employee assignment panel (Requirement 3.5).
 *
 * HTTP 422 issues are associated with the affected control via
 * `aria-invalid` / `aria-describedby`; every other failure surfaces a single
 * safe general message (Requirements 3.6, 3.7, 7.x, 8.4, 9.3, 9.4).
 */

const FORM_OPERATION = "branch-form"
const DELETE_OPERATION = "branch-delete"

const BRANCH_FORM_MODE = {
  CREATE: "create",
  EDIT: "edit",
} as const

type BranchFormMode = (typeof BRANCH_FORM_MODE)[keyof typeof BRANCH_FORM_MODE]

interface BranchFormState {
  readonly mode: BranchFormMode
  readonly id: string | null
  readonly name: string
  readonly code: string
  readonly address: string
}

function canManageBranches(actor: AccessRole): boolean {
  return actor === ACCESS_ROLE.ADMINISTRADOR
}

function emptyCreateForm(): BranchFormState {
  return { mode: BRANCH_FORM_MODE.CREATE, id: null, name: "", code: "", address: "" }
}

function editFormFor(branch: BranchDTO): BranchFormState {
  return {
    mode: BRANCH_FORM_MODE.EDIT,
    id: branch.id,
    name: branch.name,
    code: branch.code ?? "",
    address: branch.address ?? "",
  }
}

function buildBranchBody(form: BranchFormState): CreateBranchRequest {
  const body: CreateBranchRequest = { name: form.name }
  const code = form.code.trim()
  const address = form.address.trim()

  if (code.length > 0) {
    body.code = code
  }
  if (address.length > 0) {
    body.address = address
  }

  return body
}

export function BranchesAdmin() {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""
  const actorRole = access?.role

  const [branches, setBranches] = useState<readonly BranchDTO[]>([])
  const [listMessage, setListMessage] = useState<string>()
  const [form, setForm] = useState<BranchFormState | null>(null)
  const [assignmentBranchId, setAssignmentBranchId] = useState<string | null>(
    null
  )
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const loadBranches = useCallback(async () => {
    const result = await listBranches(accessToken)

    if (isProtectedSuccess(result)) {
      setBranches(result.data)
      setListMessage(undefined)
      return
    }

    setListMessage(generalIssueMessage(result))
  }, [accessToken])

  useEffect(() => {
    let active = true

    async function loadInitialBranches() {
      const result = await listBranches(accessToken)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setBranches(result.data)
        setListMessage(undefined)
        return
      }

      setListMessage(generalIssueMessage(result))
    }

    void loadInitialBranches()
    return () => {
      active = false
    }
  }, [accessToken])

  if (actorRole === undefined) {
    return null
  }

  const manageable = canManageBranches(actorRole)
  const formOperation = getOperation(states, FORM_OPERATION)
  const deleteOperation = getOperation(states, DELETE_OPERATION)
  const formFeedback = operationFeedback(formOperation)
  const deleteFeedback = operationFeedback(deleteOperation)
  const formPending = isOperationPending(states, FORM_OPERATION)

  function updateField(field: keyof BranchFormState, value: string) {
    setForm((current) =>
      current === null ? current : { ...current, [field]: value }
    )
    setStates((current) =>
      clearOperationFieldIssue(current, FORM_OPERATION, field)
    )
  }

  async function handleSubmit() {
    if (form === null || !manageable || isOperationPending(states, FORM_OPERATION)) {
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

    const body = buildBranchBody(form)
    const result =
      form.mode === BRANCH_FORM_MODE.CREATE
        ? await createBranch(accessToken, body)
        : await updateBranch(accessToken, form.id ?? "", body)

    setStates((current) => settleOperation(current, FORM_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setForm(null)
      await loadBranches()
    }
  }

  async function handleDelete(branch: BranchDTO) {
    if (!manageable || isOperationPending(states, DELETE_OPERATION)) {
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

    const result = await deleteBranch(accessToken, branch.id)
    setStates((current) => settleOperation(current, DELETE_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setForm((current) => (current?.id === branch.id ? null : current))
      await loadBranches()
    }
  }

  const nameError = fieldIssueMessage(formOperation.result, "name")
  const codeError = fieldIssueMessage(formOperation.result, "code")
  const addressError = fieldIssueMessage(formOperation.result, "address")
  const isCreate = form?.mode === BRANCH_FORM_MODE.CREATE

  return (
    <section className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Sucursales
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {manageable
            ? "Gestione las sucursales y sus empleados asignados."
            : "Consulte las sucursales y gestione sus empleados asignados."}
        </p>
      </header>

      <StatusRegion message={listMessage} tone="error" />
      <StatusRegion message={deleteFeedback.message} tone={deleteFeedback.tone} />

      {manageable ? (
        <div className="flex flex-wrap gap-2">
          <ActionActivation
            className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            onActivate={() => setForm(emptyCreateForm())}
          >
            Nueva sucursal
          </ActionActivation>
        </div>
      ) : null}

      <ul className="min-w-0 space-y-2">
        {branches.map((branch) => (
          <li
            key={branch.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{branch.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {branch.code ?? "Sin código"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionActivation
                className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                onActivate={() => setAssignmentBranchId(branch.id)}
              >
                Empleados
              </ActionActivation>
              {manageable ? (
                <>
                  <ActionActivation
                    className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                    onActivate={() => setForm(editFormFor(branch))}
                  >
                    Editar
                  </ActionActivation>
                  <ActionActivation
                    className="inline-flex h-8 items-center rounded-4xl bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-[3px] focus-visible:ring-destructive/20 disabled:opacity-50"
                    disabled={isOperationPending(states, DELETE_OPERATION)}
                    onActivate={() => void handleDelete(branch)}
                  >
                    Desactivar
                  </ActionActivation>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {manageable && form !== null ? (
        <div
          aria-label={isCreate ? "Crear sucursal" : "Editar sucursal"}
          className="min-w-0 space-y-4 rounded-lg border p-4"
          role="group"
        >
          <h2 className="text-lg font-semibold">
            {isCreate ? "Nueva sucursal" : "Editar sucursal"}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="branch-name">Nombre</Label>
            <Input
              aria-describedby={nameError ? "branch-name-error" : undefined}
              aria-invalid={nameError ? true : undefined}
              id="branch-name"
              onChange={(event) => updateField("name", event.target.value)}
              value={form.name}
            />
            {nameError ? (
              <Alert
                aria-live="assertive"
                id="branch-name-error"
                variant="destructive"
              >
                {nameError}
              </Alert>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch-code">Código</Label>
            <Input
              aria-describedby={codeError ? "branch-code-error" : undefined}
              aria-invalid={codeError ? true : undefined}
              id="branch-code"
              onChange={(event) => updateField("code", event.target.value)}
              value={form.code}
            />
            {codeError ? (
              <Alert
                aria-live="assertive"
                id="branch-code-error"
                variant="destructive"
              >
                {codeError}
              </Alert>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="branch-address">Dirección</Label>
            <Input
              aria-describedby={
                addressError ? "branch-address-error" : undefined
              }
              aria-invalid={addressError ? true : undefined}
              id="branch-address"
              onChange={(event) => updateField("address", event.target.value)}
              value={form.address}
            />
            {addressError ? (
              <Alert
                aria-live="assertive"
                id="branch-address-error"
                variant="destructive"
              >
                {addressError}
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

      {assignmentBranchId !== null ? (
        <AssignmentPanel key={assignmentBranchId} branchId={assignmentBranchId} />
      ) : null}
    </section>
  )
}

export default BranchesAdmin
