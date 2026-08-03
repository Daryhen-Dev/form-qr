import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ACCESS_AVAILABILITY,
  AccessProvider,
  useAccess,
  type AccessContext,
  type AccessRole,
} from "@/components/access/access-provider"
import { BranchesAdmin } from "@/components/operational/admin/branches"
import { UsersAdmin } from "@/components/operational/admin/users"
import { ROLE, type BranchDTO, type UserDTO } from "@/lib/types"

/**
 * Admin surfaces UI behaviour (RTL/jsdom).
 *
 * Exercises the users and branches administration components with a mocked
 * `fetch` and a role-scoped access context, covering:
 *   - HTTP 409: safe conflict message, non-sensitive data preserved, operation
 *     released (Requirements 3.6, 7.1, 7.5).
 *   - HTTP 422: issues associated with controls via `aria-invalid` /
 *     `aria-describedby`, a single safe general message for unassociated
 *     issues (Requirements 3.7, 7.6, 7.8, 8.4, 9.3).
 *   - Double submit: a single pending request per operation; the second submit
 *     dispatches no additional request (Requirement 7.1).
 *   - Secretario role restrictions: creates only `Empleado`; branches are
 *     read-only (Requirements 3.2, 3.4).
 *   - Accessible status regions: `role="status"` with `aria-live`
 *     (Requirement 9.4).
 */

// --- Fixtures ---------------------------------------------------------------

const LEAK_MARKER = "INTERNAL_LEAK_MUST_NOT_RENDER"

function makeAccess(role: AccessRole): AccessContext {
  return {
    accessToken: "access-token-must-not-render",
    principalId: "principal-must-not-render",
    role,
    availability: ACCESS_AVAILABILITY.AVAILABLE,
  }
}

function makeUser(overrides: Partial<UserDTO> = {}): UserDTO {
  return {
    id: "user-1",
    nombres: "Existing",
    apellidos: "Person",
    cedula: "0102030405",
    role: ROLE.EMPLEADO,
    passwordChangeRequired: false,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeBranch(overrides: Partial<BranchDTO> = {}): BranchDTO {
  return {
    id: "branch-1",
    name: "Sucursal Centro",
    code: "C-01",
    address: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  }
}

// --- fetch routing mock -----------------------------------------------------

interface FetchRoute {
  readonly method: string
  readonly path: string
  readonly handle: () => Response | Promise<Response>
}

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function installFetch(routes: readonly FetchRoute[]) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : String(input)
      const method = (init?.method ?? "GET").toUpperCase()

      for (const route of routes) {
        if (route.method === method && url.includes(route.path)) {
          return route.handle()
        }
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`)
    }
  )

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function postCallCount(fetchMock: ReturnType<typeof installFetch>): number {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST"
  ).length
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// --- render helpers ---------------------------------------------------------

function AccessState({
  access,
  children,
}: {
  access: AccessContext
  children: ReactNode
}) {
  const { setAccess } = useAccess()

  useEffect(() => {
    setAccess(access)
  }, [access, setAccess])

  return children
}

function renderWithAccess(ui: ReactNode, role: AccessRole) {
  return render(
    <AccessProvider>
      <AccessState access={makeAccess(role)}>{ui}</AccessState>
    </AccessProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// --- HTTP 409 ---------------------------------------------------------------

describe("UsersAdmin — HTTP 409", () => {
  beforeEach(() => {
    installFetch([
      { method: "GET", path: "/users", handle: () => jsonResponse(200, { users: [] }) },
      {
        method: "POST",
        path: "/users",
        handle: () => jsonResponse(409, { message: LEAK_MARKER }),
      },
    ])
  })

  it("conserva los datos no sensibles, libera la operación y muestra un mensaje seguro", async () => {
    const user = userEvent.setup()
    renderWithAccess(<UsersAdmin />, ROLE.ADMINISTRADOR)

    await user.click(await screen.findByRole("button", { name: "Nuevo usuario" }))
    await user.type(screen.getByLabelText("Nombres"), "Ana")
    await user.type(screen.getByLabelText("Apellidos"), "Lopez")
    await user.type(screen.getByLabelText("Cédula"), "1234567")

    await user.click(screen.getByRole("button", { name: "Guardar" }))

    // Safe conflict message announced through an accessible status region.
    const status = await screen.findByText(
      "Los datos cambiaron. Revisá la información e intentá nuevamente."
    )
    expect(status).toHaveAttribute("role", "status")
    expect(status).toHaveAttribute("aria-live", "polite")

    // Non-sensitive data is preserved for correction.
    expect(screen.getByLabelText("Nombres")).toHaveValue("Ana")
    expect(screen.getByLabelText("Apellidos")).toHaveValue("Lopez")
    expect(screen.getByLabelText("Cédula")).toHaveValue("1234567")

    // The operation is released: the submit control is enabled again.
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled()

    // No internal failure detail leaks into the DOM.
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- HTTP 422 ---------------------------------------------------------------

describe("UsersAdmin — HTTP 422", () => {
  it("asocia el problema con el control mediante aria-invalid y aria-describedby", async () => {
    installFetch([
      { method: "GET", path: "/users", handle: () => jsonResponse(200, { users: [] }) },
      {
        method: "POST",
        path: "/users",
        handle: () =>
          jsonResponse(422, {
            issues: [{ path: ["nombres"], message: LEAK_MARKER }],
          }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<UsersAdmin />, ROLE.ADMINISTRADOR)

    await user.click(await screen.findByRole("button", { name: "Nuevo usuario" }))
    await user.type(screen.getByLabelText("Nombres"), "Ana")
    await user.type(screen.getByLabelText("Apellidos"), "Lopez")
    await user.type(screen.getByLabelText("Cédula"), "1234567")

    await user.click(screen.getByRole("button", { name: "Guardar" }))

    const nombres = await screen.findByLabelText("Nombres")
    await waitFor(() =>
      expect(nombres).toHaveAttribute("aria-invalid", "true")
    )
    expect(nombres).toHaveAttribute("aria-describedby", "user-nombres-error")
    expect(nombres).toHaveAccessibleDescription("Revisá este campo.")

    // The associated error is exposed to assistive technology, and no internal
    // validation detail leaks through.
    const fieldError = screen.getByText("Revisá este campo.")
    expect(fieldError).toHaveAttribute("aria-live", "assertive")
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })

  it("muestra un único mensaje general seguro para los problemas no asociados", async () => {
    installFetch([
      { method: "GET", path: "/users", handle: () => jsonResponse(200, { users: [] }) },
      {
        method: "POST",
        path: "/users",
        handle: () =>
          jsonResponse(422, {
            issues: [{ path: ["unmappedInternalField"], message: LEAK_MARKER }],
          }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<UsersAdmin />, ROLE.ADMINISTRADOR)

    await user.click(await screen.findByRole("button", { name: "Nuevo usuario" }))
    await user.type(screen.getByLabelText("Nombres"), "Ana")
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    const general = await screen.findAllByText(
      "Revisá los campos marcados e intentá nuevamente."
    )
    expect(general).toHaveLength(1)
    expect(general[0]).toHaveAttribute("role", "status")
    expect(general[0]).toHaveAttribute("aria-live", "polite")
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- Double submit ----------------------------------------------------------

describe("UsersAdmin — doble envío", () => {
  it("mantiene una sola solicitud pendiente por operación", async () => {
    const gate = deferred<void>()
    const fetchMock = installFetch([
      { method: "GET", path: "/users", handle: () => jsonResponse(200, { users: [] }) },
      {
        method: "POST",
        path: "/users",
        handle: async () => {
          await gate.promise
          return jsonResponse(201, { user: makeUser({ id: "created-1" }) })
        },
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<UsersAdmin />, ROLE.ADMINISTRADOR)

    await user.click(await screen.findByRole("button", { name: "Nuevo usuario" }))
    await user.type(screen.getByLabelText("Nombres"), "Ana")

    await user.click(screen.getByRole("button", { name: "Guardar" }))

    // The operation is pending: the control is disabled and reports progress.
    const pending = await screen.findByRole("button", { name: "Guardando…" })
    expect(pending).toBeDisabled()
    expect(postCallCount(fetchMock)).toBe(1)

    // A second activation while pending must not dispatch another request.
    fireEvent.click(pending)
    expect(postCallCount(fetchMock)).toBe(1)

    gate.resolve()
    await waitFor(() => expect(postCallCount(fetchMock)).toBe(1))
  })
})

// --- Secretario role restrictions -------------------------------------------

describe("UsersAdmin — restricción de rol Secretario", () => {
  it("permite crear únicamente usuarios con rol Empleado y oculta desactivar", async () => {
    installFetch([
      {
        method: "GET",
        path: "/users",
        handle: () =>
          jsonResponse(200, {
            users: [
              makeUser({ id: "admin-1", role: ROLE.ADMINISTRADOR, nombres: "Root" }),
              makeUser({ id: "emp-1", role: ROLE.EMPLEADO, nombres: "Empleada" }),
            ],
          }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<UsersAdmin />, ROLE.SECRETARIO)

    await screen.findByText("Root Person")

    // A Secretario cannot deactivate users.
    expect(
      screen.queryByRole("button", { name: "Desactivar" })
    ).not.toBeInTheDocument()

    // The Administrador record is not editable; the Empleado record is.
    const editButtons = screen.getAllByRole("button", { name: "Editar" })
    expect(editButtons[0]).toBeDisabled()
    expect(editButtons[1]).toBeEnabled()

    // The create form offers only the Empleado role.
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }))
    const roleSelect = screen.getByLabelText("Rol")
    const options = within(roleSelect).getAllByRole("option")
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent("Empleado")
  })
})

describe("BranchesAdmin — restricción de rol Secretario", () => {
  it("presenta las sucursales sólo en modo consulta", async () => {
    installFetch([
      {
        method: "GET",
        path: "/branches",
        handle: () => jsonResponse(200, { branches: [makeBranch()] }),
      },
    ])

    renderWithAccess(<BranchesAdmin />, ROLE.SECRETARIO)

    await screen.findByText("Sucursal Centro")

    // Read-only: create / edit / deactivate controls are absent.
    expect(
      screen.queryByRole("button", { name: "Nueva sucursal" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Editar" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Desactivar" })
    ).not.toBeInTheDocument()

    // The employee assignment entry point remains available (Requirement 3.5).
    expect(
      screen.getByRole("button", { name: "Empleados" })
    ).toBeInTheDocument()
  })
})
