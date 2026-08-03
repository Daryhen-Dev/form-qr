"use client"

import { useCallback, useEffect, useState } from "react"

import {
  ACCESS_ROLE,
  useAccess,
  type AccessRole,
} from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
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
  type UserDTO,
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
  createUser,
  deleteUser,
  listUsers,
  updateUser,
} from "@/lib/operational-api/users"
import { ROLE, type Role } from "@/lib/types"

/**
 * Users administration surface.
 *
 * Lists users and offers a create/edit detail form plus deactivation, wired to
 * the existing `/api/v1/users` contracts. The available controls are derived
 * from the current role (Requirements 3.1, 3.2): an Administrador may operate
 * every user, while a Secretario may only create `Empleado` users and edit
 * their own record or `Empleado` records, and may not deactivate users.
 *
 * Field issues from HTTP 422 are associated with the affected control via
 * `aria-invalid` / `aria-describedby`; every other failure surfaces a single
 * safe general message through `StatusRegion` (Requirements 3.6, 3.7, 7.x,
 * 8.4, 9.3, 9.4).
 */

const FORM_OPERATION = "user-form"
const DELETE_OPERATION = "user-delete"

const USER_FORM_MODE = {
  CREATE: "create",
  EDIT: "edit",
} as const

type UserFormMode = (typeof USER_FORM_MODE)[keyof typeof USER_FORM_MODE]

interface UserFormState {
  readonly mode: UserFormMode
  readonly id: string | null
  readonly nombres: string
  readonly apellidos: string
  readonly cedula: string
  readonly role: Role
}

const ROLE_LABEL: Record<Role, string> = {
  [ROLE.ADMINISTRADOR]: "Administrador",
  [ROLE.SECRETARIO]: "Secretario",
  [ROLE.EMPLEADO]: "Empleado",
}

function creatableRoles(actor: AccessRole): readonly Role[] {
  if (actor === ACCESS_ROLE.ADMINISTRADOR) {
    return [ROLE.ADMINISTRADOR, ROLE.SECRETARIO, ROLE.EMPLEADO]
  }

  return [ROLE.EMPLEADO]
}

function canEditUser(
  actor: AccessRole,
  principalId: string,
  user: UserDTO
): boolean {
  if (actor === ACCESS_ROLE.ADMINISTRADOR) {
    return true
  }

  return user.id === principalId || user.role === ROLE.EMPLEADO
}

function canDeleteUsers(actor: AccessRole): boolean {
  return actor === ACCESS_ROLE.ADMINISTRADOR
}

function emptyCreateForm(actor: AccessRole): UserFormState {
  const [defaultRole] = creatableRoles(actor)

  return {
    mode: USER_FORM_MODE.CREATE,
    id: null,
    nombres: "",
    apellidos: "",
    cedula: "",
    role: defaultRole,
  }
}

function editFormFor(user: UserDTO): UserFormState {
  return {
    mode: USER_FORM_MODE.EDIT,
    id: user.id,
    nombres: user.nombres,
    apellidos: user.apellidos,
    cedula: user.cedula,
    role: user.role,
  }
}

export function UsersAdmin() {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""
  const actorRole = access?.role
  const principalId = access?.principalId ?? ""

  const [users, setUsers] = useState<readonly UserDTO[]>([])
  const [listMessage, setListMessage] = useState<string>()
  const [form, setForm] = useState<UserFormState | null>(null)
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const loadUsers = useCallback(async () => {
    const result = await listUsers(accessToken)

    if (isProtectedSuccess(result)) {
      setUsers(result.data)
      setListMessage(undefined)
      return
    }

    setListMessage(generalIssueMessage(result))
  }, [accessToken])

  useEffect(() => {
    let active = true

    async function loadInitialUsers() {
      const result = await listUsers(accessToken)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setUsers(result.data)
        setListMessage(undefined)
        return
      }

      setListMessage(generalIssueMessage(result))
    }

    void loadInitialUsers()
    return () => {
      active = false
    }
  }, [accessToken])

  if (actorRole === undefined) {
    return null
  }

  const formOperation = getOperation(states, FORM_OPERATION)
  const deleteOperation = getOperation(states, DELETE_OPERATION)
  const formFeedback = operationFeedback(formOperation)
  const deleteFeedback = operationFeedback(deleteOperation)
  const formPending = isOperationPending(states, FORM_OPERATION)

  function updateField(field: keyof UserFormState, value: string) {
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

    const result =
      form.mode === USER_FORM_MODE.CREATE
        ? await createUser(accessToken, {
            nombres: form.nombres,
            apellidos: form.apellidos,
            cedula: form.cedula,
            role: form.role,
          })
        : await updateUser(accessToken, form.id ?? "", {
            nombres: form.nombres,
            apellidos: form.apellidos,
          })

    setStates((current) => settleOperation(current, FORM_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setForm(null)
      await loadUsers()
    }
  }

  async function handleDelete(user: UserDTO) {
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

    const result = await deleteUser(accessToken, user.id)
    setStates((current) => settleOperation(current, DELETE_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setForm((current) => (current?.id === user.id ? null : current))
      await loadUsers()
    }
  }

  const nombresError = fieldIssueMessage(formOperation.result, "nombres")
  const apellidosError = fieldIssueMessage(formOperation.result, "apellidos")
  const cedulaError = fieldIssueMessage(formOperation.result, "cedula")
  const roleError = fieldIssueMessage(formOperation.result, "role")
  const isCreate = form?.mode === USER_FORM_MODE.CREATE

  return (
    <section className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Usuarios
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Gestione las personas usuarias autorizadas para operar form-qr.
        </p>
      </header>

      <StatusRegion message={listMessage} tone="error" />
      <StatusRegion message={deleteFeedback.message} tone={deleteFeedback.tone} />

      <div className="flex flex-wrap gap-2">
        <ActionActivation
          className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          onActivate={() => setForm(emptyCreateForm(actorRole))}
        >
          Nuevo usuario
        </ActionActivation>
      </div>

      <ul className="min-w-0 space-y-2">
        {users.map((user) => {
          const editable = canEditUser(actorRole, principalId, user)

          return (
            <li
              key={user.id}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {user.nombres} {user.apellidos}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[user.role]} · {user.cedula}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionActivation
                  className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                  disabled={!editable}
                  onActivate={() => setForm(editFormFor(user))}
                >
                  Editar
                </ActionActivation>
                {canDeleteUsers(actorRole) ? (
                  <ActionActivation
                    className="inline-flex h-8 items-center rounded-4xl bg-destructive/10 px-3 text-sm font-medium text-destructive hover:bg-destructive/20 focus-visible:ring-[3px] focus-visible:ring-destructive/20 disabled:opacity-50"
                    disabled={isOperationPending(states, DELETE_OPERATION)}
                    onActivate={() => void handleDelete(user)}
                  >
                    Desactivar
                  </ActionActivation>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {form !== null ? (
        <div
          aria-label={isCreate ? "Crear usuario" : "Editar usuario"}
          className="min-w-0 space-y-4 rounded-lg border p-4"
          role="group"
        >
          <h2 className="text-lg font-semibold">
            {isCreate ? "Nuevo usuario" : "Editar usuario"}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="user-nombres">Nombres</Label>
            <Input
              aria-describedby={nombresError ? "user-nombres-error" : undefined}
              aria-invalid={nombresError ? true : undefined}
              id="user-nombres"
              onChange={(event) => updateField("nombres", event.target.value)}
              value={form.nombres}
            />
            {nombresError ? (
              <Alert
                aria-live="assertive"
                id="user-nombres-error"
                variant="destructive"
              >
                {nombresError}
              </Alert>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-apellidos">Apellidos</Label>
            <Input
              aria-describedby={
                apellidosError ? "user-apellidos-error" : undefined
              }
              aria-invalid={apellidosError ? true : undefined}
              id="user-apellidos"
              onChange={(event) => updateField("apellidos", event.target.value)}
              value={form.apellidos}
            />
            {apellidosError ? (
              <Alert
                aria-live="assertive"
                id="user-apellidos-error"
                variant="destructive"
              >
                {apellidosError}
              </Alert>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-cedula">Cédula</Label>
            <Input
              aria-describedby={cedulaError ? "user-cedula-error" : undefined}
              aria-invalid={cedulaError ? true : undefined}
              disabled={!isCreate}
              id="user-cedula"
              inputMode="numeric"
              onChange={(event) => updateField("cedula", event.target.value)}
              value={form.cedula}
            />
            {cedulaError ? (
              <Alert
                aria-live="assertive"
                id="user-cedula-error"
                variant="destructive"
              >
                {cedulaError}
              </Alert>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Rol</Label>
            <select
              aria-describedby={roleError ? "user-role-error" : undefined}
              aria-invalid={roleError ? true : undefined}
              className="h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              disabled={!isCreate}
              id="user-role"
              onChange={(event) => updateField("role", event.target.value)}
              value={form.role}
            >
              {(isCreate ? creatableRoles(actorRole) : [form.role]).map(
                (role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL[role]}
                  </option>
                )
              )}
            </select>
            {roleError ? (
              <Alert
                aria-live="assertive"
                id="user-role-error"
                variant="destructive"
              >
                {roleError}
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
    </section>
  )
}

export default UsersAdmin
