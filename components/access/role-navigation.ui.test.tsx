import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime"

import { RoleNavigation } from "./role-navigation"
import {
  ACCESS_AVAILABILITY,
  ACCESS_ROLE,
  type AccessRole,
} from "./access-provider"
import {
  OPERATIONAL_ROUTE,
  SCAN_ROUTE,
  resolveRouteSurface,
} from "@/lib/operational-ui/routes"

/**
 * Component tests for the role-scoped operational navigation.
 *
 * Exercises the observable, accessibility-relevant behavior of `RoleNavigation`
 * wired to the real route source of truth (`resolveRouteSurface`):
 * - the menu presents only the surface authorized for each role;
 * - every item is a real anchor (`Link`) with an accessible name and href;
 * - Tab / Shift+Tab visit each enabled link once in visual reading order;
 * - the active route is announced with `aria-current="page"`;
 * - keyboard and pointer activate the same control equivalently.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 9.1, 9.2, 9.6
 */

const MANAGEMENT_MENU = [
  { route: OPERATIONAL_ROUTE.HOME, label: "Inicio" },
  { route: OPERATIONAL_ROUTE.USERS, label: "Usuarios" },
  { route: OPERATIONAL_ROUTE.BRANCHES, label: "Sucursales" },
  { route: OPERATIONAL_ROUTE.QUESTIONNAIRES, label: "Cuestionarios" },
  { route: OPERATIONAL_ROUTE.REPORTS, label: "Reportes" },
] as const

const EMPLOYEE_MENU = [{ route: SCAN_ROUTE.HOME, label: "Cuestionario asignado" }] as const

const MANAGEMENT_NAV_LABEL = "Navegación de operaciones"
const EMPLOYEE_NAV_LABEL = "Navegación de cuestionario"

function createMockRouter(): AppRouterInstance {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }
}

/**
 * Render `RoleNavigation` for a role and requested path, deriving the allowed
 * routes and active route from the real route source of truth so the test
 * reflects the production wiring rather than hand-picked props.
 */
function renderNavigation(role: AccessRole, requestedPath: string) {
  const surface = resolveRouteSurface(
    { role, availability: ACCESS_AVAILABILITY.AVAILABLE },
    requestedPath
  )
  const router = createMockRouter()

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppRouterContext.Provider value={router}>
        {children}
      </AppRouterContext.Provider>
    )
  }

  const utils = render(
    <RoleNavigation
      activeRoute={surface.activeRoute}
      allowedRoutes={surface.allowedRoutes}
      role={role}
    />,
    { wrapper: Wrapper }
  )

  return { ...utils, router, surface }
}

afterEach(cleanup)

describe("RoleNavigation", () => {
  it.each([ACCESS_ROLE.ADMINISTRADOR, ACCESS_ROLE.SECRETARIO] as const)(
    "presenta el menú de gestión completo para %s como enlaces accesibles",
    (role) => {
      renderNavigation(role, OPERATIONAL_ROUTE.HOME)

      const nav = screen.getByRole("navigation", { name: MANAGEMENT_NAV_LABEL })
      const links = within(nav).getAllByRole("link")

      expect(links).toHaveLength(MANAGEMENT_MENU.length)
      for (const { route, label } of MANAGEMENT_MENU) {
        const link = within(nav).getByRole("link", { name: label })
        expect(link.tagName).toBe("A")
        expect(link).toHaveAttribute("href", route)
      }
    }
  )

  it("presenta únicamente el flujo de cuestionario para Empleado", () => {
    renderNavigation(ACCESS_ROLE.EMPLEADO, SCAN_ROUTE.HOME)

    const nav = screen.getByRole("navigation", { name: EMPLOYEE_NAV_LABEL })
    const links = within(nav).getAllByRole("link")

    expect(links).toHaveLength(EMPLOYEE_MENU.length)
    expect(within(nav).getByRole("link", { name: "Cuestionario asignado" })).toHaveAttribute(
      "href",
      SCAN_ROUTE.HOME
    )
    // The employee surface must not widen into management routes.
    for (const { label } of MANAGEMENT_MENU) {
      expect(within(nav).queryByRole("link", { name: label })).not.toBeInTheDocument()
    }
  })

  it("anuncia con aria-current='page' sólo el enlace de la ruta activa", () => {
    renderNavigation(ACCESS_ROLE.ADMINISTRADOR, OPERATIONAL_ROUTE.USERS)

    const activeLink = screen.getByRole("link", { name: "Usuarios" })
    expect(activeLink).toHaveAttribute("aria-current", "page")

    for (const { label } of MANAGEMENT_MENU) {
      if (label === "Usuarios") {
        continue
      }
      expect(screen.getByRole("link", { name: label })).not.toHaveAttribute("aria-current")
    }
  })

  it("recorre cada enlace habilitado una vez en orden visual con Tab", async () => {
    const user = userEvent.setup()
    const { surface } = renderNavigation(ACCESS_ROLE.ADMINISTRADOR, OPERATIONAL_ROUTE.HOME)

    const nav = screen.getByRole("navigation", { name: MANAGEMENT_NAV_LABEL })
    const links = within(nav).getAllByRole("link")

    // DOM order matches the authorized reading order from the source of truth.
    expect(links.map((link) => link.getAttribute("href"))).toEqual([...surface.allowedRoutes])

    for (const link of links) {
      await user.tab()
      expect(link).toHaveFocus()
    }
  })

  it("recorre los enlaces en orden inverso con Mayús+Tab", async () => {
    const user = userEvent.setup()
    renderNavigation(ACCESS_ROLE.ADMINISTRADOR, OPERATIONAL_ROUTE.HOME)

    const nav = screen.getByRole("navigation", { name: MANAGEMENT_NAV_LABEL })
    const links = within(nav).getAllByRole("link")

    // Move focus to the last link, then walk backwards one stop per link.
    for (let index = 0; index < links.length; index += 1) {
      await user.tab()
    }
    expect(links[links.length - 1]).toHaveFocus()

    for (let index = links.length - 2; index >= 0; index -= 1) {
      await user.tab({ shift: true })
      expect(links[index]).toHaveFocus()
    }
  })

  it("activa el mismo enlace de forma equivalente por teclado y por puntero", async () => {
    const user = userEvent.setup()
    renderNavigation(ACCESS_ROLE.ADMINISTRADOR, OPERATIONAL_ROUTE.HOME)

    const link = screen.getByRole("link", { name: "Usuarios" })

    const activations: EventTarget[] = []
    const handler = (event: Event) => activations.push(event.target as EventTarget)
    document.addEventListener("click", handler, true)

    try {
      link.focus()
      expect(link).toHaveFocus()
      await user.keyboard("{Enter}")

      await user.click(link)
    } finally {
      document.removeEventListener("click", handler, true)
    }

    // Both keyboard (Enter on the focused link) and pointer produced a click on
    // the same control: equivalent activation for the navigation item.
    expect(activations).toHaveLength(2)
    expect(activations[0]).toBe(link)
    expect(activations[1]).toBe(link)
  })
})
