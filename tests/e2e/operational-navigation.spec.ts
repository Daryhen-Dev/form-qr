import { expect, test, type Page } from "@playwright/test"

/**
 * Integrated navigation and safe-denial coverage for the operational shell.
 *
 * Because the in-memory access context only exists after a login within the
 * same document, each scenario authenticates directly on the target protected
 * route: the login surface is presented first, and a successful login lets the
 * route gate render the role-scoped shell without a full reload.
 *
 * Covers: role menu (management vs employee), the navigation landmark and its
 * links/aria-current, keyboard reachability in reading order, and the safe
 * denial that replaces an unauthorized route with the role's start view without
 * revealing permissions, resources, or internal routes.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 9.1, 9.2
 */

const LOGIN = {
  CEDULA: "123456",
  PASSWORD: "current-password",
} as const

const MANAGEMENT_MENU = [
  { route: "/operaciones", label: "Inicio" },
  { route: "/operaciones/usuarios", label: "Usuarios" },
  { route: "/operaciones/sucursales", label: "Sucursales" },
  { route: "/operaciones/cuestionarios", label: "Cuestionarios" },
  { route: "/operaciones/reportes", label: "Reportes" },
] as const

const MANAGEMENT_NAV_LABEL = "Navegación de operaciones"
const EMPLOYEE_NAV_LABEL = "Navegación de cuestionario"

function loginPayload(role: string, passwordChangeRequired: boolean) {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    user: { id: "user-1", role },
    passwordChangeRequired,
  }
}

function getLoginControls(page: Page) {
  return {
    heading: page.getByRole("heading", { name: "Iniciar sesión", exact: true }),
    cedula: page.getByLabel("Cédula", { exact: true }),
    password: page.getByLabel("Contraseña", { exact: true }),
    submit: page.getByRole("button", { name: "Iniciar sesión", exact: true }),
  }
}

async function stubAuth(page: Page, payload: unknown) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    })
  })
}

/**
 * Authenticate on the currently loaded protected route so the route gate can
 * render the role shell in the same document (in-memory access is preserved).
 */
async function loginOnCurrentRoute(page: Page, role: string) {
  await stubAuth(page, loginPayload(role, false))

  const login = getLoginControls(page)
  await expect(login.heading).toBeVisible()
  await login.cedula.fill(LOGIN.CEDULA)
  await login.password.fill(LOGIN.PASSWORD)
  await login.submit.click()
}

test.describe("Operational navigation", () => {
  for (const role of ["Administrador", "Secretario"] as const) {
    test(`presents the full management menu for ${role}`, async ({ page }) => {
      await page.goto("/operaciones")
      await loginOnCurrentRoute(page, role)

      // The management start view renders once access is available.
      await expect(
        page.getByRole("heading", { name: "Operaciones", exact: true })
      ).toBeVisible()

      const nav = page.getByRole("navigation", { name: MANAGEMENT_NAV_LABEL })
      await expect(nav).toBeVisible()
      await expect(nav.getByRole("link")).toHaveCount(MANAGEMENT_MENU.length)

      for (const { route, label } of MANAGEMENT_MENU) {
        const link = nav.getByRole("link", { name: label, exact: true })
        await expect(link).toHaveAttribute("href", route)
      }

      // The current route is the authorized start and is announced as active.
      await expect(nav.getByRole("link", { name: "Inicio", exact: true })).toHaveAttribute(
        "aria-current",
        "page"
      )
      await expect(getLoginControls(page).heading).toHaveCount(0)
    })
  }

  test("presents only the questionnaire flow for Empleado", async ({ page }) => {
    await page.goto("/scan")
    await loginOnCurrentRoute(page, "Empleado")

    await expect(
      page.getByRole("heading", { name: "Cuestionarios asignados", exact: true })
    ).toBeVisible()

    const nav = page.getByRole("navigation", { name: EMPLOYEE_NAV_LABEL })
    await expect(nav).toBeVisible()
    await expect(nav.getByRole("link")).toHaveCount(1)
    await expect(
      nav.getByRole("link", { name: "Cuestionario asignado", exact: true })
    ).toHaveAttribute("href", "/scan")

    // The employee surface never widens into management routes.
    for (const { label } of MANAGEMENT_MENU) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0)
    }
  })

  test("moves focus through the management menu in reading order", async ({ page }) => {
    await page.goto("/operaciones")
    await loginOnCurrentRoute(page, "Administrador")

    const nav = page.getByRole("navigation", { name: MANAGEMENT_NAV_LABEL })
    await expect(nav).toBeVisible()

    // Anchor on the first menu link, then verify Tab advances one enabled link
    // at a time in visual reading order.
    const firstLink = nav.getByRole("link", { name: MANAGEMENT_MENU[0].label, exact: true })
    await firstLink.focus()
    await expect(firstLink).toBeFocused()

    for (const { label } of MANAGEMENT_MENU.slice(1)) {
      await page.keyboard.press("Tab")
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeFocused()
    }
  })

  test("safely replaces an unauthorized route with the role start view", async ({ page }) => {
    // An Empleado requesting the management surface is returned to their own
    // start view with a safe message and no internal detail leaked.
    await page.goto("/operaciones")
    await loginOnCurrentRoute(page, "Empleado")

    await expect(page).toHaveURL(/\/scan$/)
    await expect(
      page.getByRole("heading", { name: "Cuestionarios asignados", exact: true })
    ).toBeVisible()

    // No management navigation or internal management routes are exposed.
    await expect(
      page.getByRole("navigation", { name: MANAGEMENT_NAV_LABEL })
    ).toHaveCount(0)
    for (const { label } of MANAGEMENT_MENU.filter(({ label }) => label !== "Inicio")) {
      await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(0)
    }
  })
})
