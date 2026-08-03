import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { AccessShell } from "./access-shell"
import {
  ACCESS_AVAILABILITY,
  ACCESS_ROLE,
  AccessProvider,
  createAccessContext,
  useAccess,
  type AccessContext,
  type AccessRole,
} from "./access-provider"

const ROLE_START_CASES = [
  [ACCESS_ROLE.ADMINISTRADOR, "Operaciones"],
  [ACCESS_ROLE.SECRETARIO, "Operaciones"],
  [ACCESS_ROLE.EMPLEADO, "Cuestionarios asignados"],
] as const

function AccessState({ access, children }: { access: AccessContext | undefined; children: ReactNode }) {
  const { setAccess } = useAccess()

  useEffect(() => {
    if (access !== undefined) {
      setAccess(access)
    }
  }, [access, setAccess])

  return children
}

function renderAccessShell(access: AccessContext | undefined) {
  return render(
    <AccessProvider>
      <AccessState access={access}>
        <AccessShell />
      </AccessState>
    </AccessProvider>
  )
}

function expectNoAccessDataInBrowser(access: AccessContext) {
  const browserStorage = JSON.stringify({ local: { ...window.localStorage }, session: { ...window.sessionStorage } })

  for (const value of [access.accessToken, access.principalId]) {
    expect(document.documentElement.outerHTML).not.toContain(value)
    expect(window.location.href).not.toContain(value)
    expect(browserStorage).not.toContain(value)
  }
}

afterEach(cleanup)

describe("AccessShell", () => {
  it("mantiene el login para un contexto inválido y asocia sus errores de campo", async () => {
    const user = userEvent.setup()
    const invalidAccess = createAccessContext({
      accessToken: "invalid-access-token-must-not-render",
      user: { id: "invalid-principal-must-not-render", role: "Visitante" },
      availability: ACCESS_AVAILABILITY.AVAILABLE,
    })

    expect(invalidAccess).toBeUndefined()
    renderAccessShell(invalidAccess)

    const cedula = screen.getByLabelText("Cédula")
    const password = screen.getByLabelText("Contraseña")
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    expect(screen.getByRole("heading", { name: "Iniciar sesión" })).toBeInTheDocument()
    expect(cedula).toHaveAttribute("aria-invalid", "true")
    expect(password).toHaveAttribute("aria-invalid", "true")
    expect(cedula).toHaveAccessibleDescription("Ingrese una cédula de 6 a 15 dígitos.")
    expect(password).toHaveAccessibleDescription("La contraseña es obligatoria.")
    expect(screen.getByText("Ingrese una cédula de 6 a 15 dígitos.")).toHaveAttribute("aria-live", "assertive")
    expect(screen.queryByRole("heading", { name: "Operaciones" })).not.toBeInTheDocument()
  })

  it("muestra exclusivamente el cambio obligatorio y no expone el contexto restringido", async () => {
    const access = createAccess(ACCESS_ROLE.ADMINISTRADOR, ACCESS_AVAILABILITY.RESTRICTED)
    renderAccessShell(access)

    expect(await screen.findByRole("heading", { name: "Cambio de contraseña obligatorio" })).toBeInTheDocument()
    expect(screen.getByLabelText("Nueva contraseña")).toHaveAttribute("type", "password")
    expect(screen.queryByLabelText("Cédula")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Operaciones" })).not.toBeInTheDocument()
    expectNoAccessDataInBrowser(access)
  })

  it.each(ROLE_START_CASES)("presenta el inicio de %s con estado accesible y sin secretos", async (role: AccessRole, heading) => {
    const access = createAccess(role, ACCESS_AVAILABILITY.AVAILABLE)
    renderAccessShell(access)

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument()
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("Acceso habilitado.")
    expect(status).toHaveAttribute("aria-live", "polite")
    expect(status).toHaveAttribute("aria-atomic", "true")
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument()
    expectNoAccessDataInBrowser(access)
  })
})

function createAccess(role: AccessRole, availability: AccessContext["availability"]): AccessContext {
  return {
    accessToken: `access-token-${role}-must-not-render`,
    principalId: `principal-${role}-must-not-render`,
    role,
    availability,
  }
}
