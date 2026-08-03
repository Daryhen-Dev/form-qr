import { expect, test, type Page, type Route } from "@playwright/test"

/**
 * Integrated accessibility and adaptation coverage for the first-cut
 * operational flows over the existing `/api/v1` contracts.
 *
 * Because the in-memory access context only exists after a login within the
 * same document, protected scenarios authenticate directly on the target route
 * (following operational-access/operational-navigation/operational-admin): the
 * login surface is presented first, and a successful login lets the route gate
 * render the role-scoped shell without a full reload.
 *
 * Covers:
 *   - Keyboard/pointer activation equivalence: activating the same operation
 *     with the same values via pointer (click) or keyboard (Enter) produces the
 *     same observable result (Requirements 9.2, 9.6).
 *   - Focus traversal: Tab / Shift+Tab move focus once per enabled control in
 *     visual reading order with a distinguishable focus indicator, and every
 *     control exposes an accessible name (Requirements 9.1, 9.2).
 *   - Responsive adaptation: at 320, 768, 1024 and 1440 CSS px the reachable
 *     first-cut views (login, role start, administration, scan, reports)
 *     complete without page-level horizontal overflow, i.e.
 *     `document.scrollingElement.scrollWidth <= clientWidth`
 *     (Requirements 9.3, 9.4, 9.5 for the accessible status/error regions that
 *     ship with those views, and 9.5 specifically for the overflow guarantee).
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

const LOGIN = {
  CEDULA: "123456",
  PASSWORD: "current-password",
} as const

const QR_TOKEN = "qr-token-1"
const QUESTIONNAIRE_ID = "questionnaire-1"
const TIMESTAMP = "2024-01-01T00:00:00.000Z"

/** The four CSS widths required by Requirement 9.5 (inclusive 320..1440). */
const VIEWPORT_WIDTHS = [320, 768, 1024, 1440] as const
const VIEWPORT_HEIGHT = 800

type Role = "Administrador" | "Secretario" | "Empleado"

function loginPayload(role: Role) {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    user: { id: "user-1", role },
    passwordChangeRequired: false,
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

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  })
}

async function stubAuth(page: Page, getRole: () => Role) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await fulfillJson(route, 200, loginPayload(getRole()))
  })
}

async function fillCredentials(page: Page) {
  const login = getLoginControls(page)
  await expect(login.heading).toBeVisible()
  await login.cedula.fill(LOGIN.CEDULA)
  await login.password.fill(LOGIN.PASSWORD)
}

/** True when the focused element renders a distinguishable focus indicator. */
async function hasVisibleFocusIndicator(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!(element instanceof HTMLElement)) {
      return false
    }
    const style = getComputedStyle(element)
    const hasOutline =
      style.outlineStyle !== "none" &&
      style.outlineWidth !== "0px" &&
      style.outlineWidth !== ""
    const hasRing = style.boxShadow !== "none" && style.boxShadow !== ""
    return hasOutline || hasRing
  })
}

/** Page-level horizontal overflow measurement requested by Requirement 9.5. */
async function measureHorizontalOverflow(
  page: Page
): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => {
    const element = document.scrollingElement ?? document.documentElement
    return { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
  })
}

test.describe("Operational accessibility", () => {
  test("keyboard and pointer activation of the same operation produce the same observable result", async ({
    browser,
  }) => {
    // Requirement 9.6: activating an equivalent operation with the same values
    // via keyboard or pointer applies the same validations and yields the same
    // observable result. Each activation runs in an isolated context so the two
    // in-memory access flows never bleed into each other.
    const outcomes: Array<{ heading: string | null; statusVisible: boolean }> = []

    for (const activation of ["pointer", "keyboard"] as const) {
      const context = await browser.newContext()
      const page = await context.newPage()
      await stubAuth(page, () => "Administrador")
      await page.goto("/")

      await fillCredentials(page)
      const login = getLoginControls(page)
      if (activation === "pointer") {
        await login.submit.click()
      } else {
        // Submitting the form from the field with the keyboard (Enter).
        await login.password.press("Enter")
      }

      const start = page.getByRole("heading", { name: "Operaciones", exact: true })
      await expect(start).toBeVisible()
      const statusVisible = await page
        .getByText("Acceso habilitado.", { exact: true })
        .isVisible()

      outcomes.push({ heading: await start.textContent(), statusVisible })
      await context.close()
    }

    // Both activation methods land on the identical observable outcome.
    expect(outcomes[0]).toEqual(outcomes[1])
    expect(outcomes[0].heading).toBe("Operaciones")
    expect(outcomes[0].statusVisible).toBe(true)
  })

  test("Tab and Shift+Tab traverse the login controls in reading order with visible focus", async ({
    page,
  }) => {
    // Requirements 9.1 / 9.2: focus advances once per enabled control in the
    // visual reading order, each control exposes an accessible name, and the
    // focused control shows a distinguishable focus indicator.
    await stubAuth(page, () => "Administrador")
    await page.goto("/")

    const login = getLoginControls(page)
    await expect(login.heading).toBeVisible()

    // Every interactive control exposes an accessible name (Requirement 9.2).
    await expect(login.cedula).toBeVisible()
    await expect(login.password).toBeVisible()
    await expect(login.submit).toBeVisible()

    // Anchor on the first control, then Tab forward through the reading order.
    await login.cedula.focus()
    await expect(login.cedula).toBeFocused()

    await page.keyboard.press("Tab")
    await expect(login.password).toBeFocused()
    expect(await hasVisibleFocusIndicator(page)).toBe(true)

    await page.keyboard.press("Tab")
    await expect(login.submit).toBeFocused()
    expect(await hasVisibleFocusIndicator(page)).toBe(true)

    // Shift+Tab reverses through the same controls in the opposite order.
    await page.keyboard.press("Shift+Tab")
    await expect(login.password).toBeFocused()

    await page.keyboard.press("Shift+Tab")
    await expect(login.cedula).toBeFocused()
  })

  for (const width of VIEWPORT_WIDTHS) {
    test(`reachable first-cut views avoid horizontal page overflow at ${width}px`, async ({
      page,
    }) => {
      // Requirement 9.5: between 320 and 1440 CSS px inclusive the first-cut
      // flows complete without page-level horizontal scrolling.
      await page.setViewportSize({ width, height: VIEWPORT_HEIGHT })

      let role: Role = "Administrador"
      await stubAuth(page, () => role)

      // Collection GETs backing the reachable management/scan surfaces.
      await page.route("**/api/v1/users", async (route) => {
        if (route.request().method() === "GET") {
          return fulfillJson(route, 200, {
            users: [
              {
                id: "user-1",
                nombres: "Ada",
                apellidos: "Lovelace",
                cedula: "0101010101",
                role: "Empleado",
                passwordChangeRequired: false,
                createdAt: TIMESTAMP,
                updatedAt: TIMESTAMP,
              },
            ],
          })
        }
        return route.fallback()
      })

      await page.route("**/api/v1/branches", async (route) => {
        if (route.request().method() === "GET") {
          return fulfillJson(route, 200, {
            branches: [
              {
                id: "branch-1",
                name: "Central",
                code: "C-001",
                address: null,
                createdAt: TIMESTAMP,
                updatedAt: TIMESTAMP,
              },
            ],
          })
        }
        return route.fallback()
      })

      await page.route("**/api/v1/scan/*", async (route) => {
        if (route.request().method() === "GET") {
          return fulfillJson(route, 200, {
            scan: {
              questionnaireId: QUESTIONNAIRE_ID,
              version: {
                id: "version-1",
                questionnaireId: QUESTIONNAIRE_ID,
                versionNumber: 1,
                status: "published",
                publishedAt: TIMESTAMP,
                createdAt: TIMESTAMP,
                updatedAt: TIMESTAMP,
              },
              questions: [
                {
                  id: "question-1",
                  order: 1,
                  type: "long_text",
                  prompt: "Nota diaria de apertura para la sucursal asignada",
                  required: true,
                  config: {},
                },
              ],
              status: "absent",
              response: null,
            },
          })
        }
        return route.fallback()
      })

      // Each descriptor is a reachable first-cut view. `role` gates the login
      // payload; unprotected `/` shows the login surface directly.
      const views: Array<{
        name: string
        role: Role | null
        path: string
        heading: string
      }> = [
        { name: "login", role: null, path: "/", heading: "Iniciar sesión" },
        {
          name: "management start",
          role: "Administrador",
          path: "/operaciones",
          heading: "Operaciones",
        },
        {
          name: "users administration",
          role: "Administrador",
          path: "/operaciones/usuarios",
          heading: "Usuarios",
        },
        {
          name: "reports",
          role: "Administrador",
          path: "/operaciones/reportes",
          heading: "Reportes",
        },
        {
          name: "scan",
          role: "Empleado",
          path: `/scan/${QR_TOKEN}`,
          heading: "Cuestionario diario",
        },
      ]

      for (const view of views) {
        // Navigating reloads the document, clearing any prior in-memory access.
        await page.goto(view.path)

        if (view.role !== null) {
          role = view.role
          await fillCredentials(page)
          await getLoginControls(page).submit.click()
        }

        await expect(
          page.getByRole("heading", { name: view.heading, exact: true })
        ).toBeVisible()

        const { scrollWidth, clientWidth } = await measureHorizontalOverflow(page)
        expect(
          scrollWidth,
          `"${view.name}" overflows horizontally at ${width}px (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`
        ).toBeLessThanOrEqual(clientWidth)
      }
    })
  }
})
