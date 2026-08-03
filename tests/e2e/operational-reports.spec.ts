import { expect, test, type Page, type Route } from "@playwright/test"

/**
 * Integrated operational-reports coverage over the existing `/api/v1/reports/*`
 * contracts (pending, compliance, history).
 *
 * Because the in-memory access context only exists after a login within the
 * same document, each scenario authenticates directly on the target protected
 * route (following operational-access/operational-navigation/operational-admin):
 * the login surface is presented first, and a successful login lets the route
 * gate render the role-scoped reports shell without a full reload.
 *
 * The three reports are composed inside the single authorized
 * `/operaciones/reportes` route via a report-type selector, so every report is
 * reachable without widening the authorized surface.
 *
 * Covers: querying the three report types with their allowed filters;
 * presenting results and pagination metadata (page/pageSize/total); and
 * requesting a valid page (advancing a page for compliance and history). Every
 * mocked endpoint asserts the querystring only carries parameters the Existing
 * API Contract accepts.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */

const LOGIN = {
  CEDULA: "123456",
  PASSWORD: "current-password",
} as const

/** Allowed querystring parameters per report endpoint (Requirements 6.3-6.5). */
const ALLOWED_PARAMS = {
  pending: new Set(["businessDay", "branchId", "questionnaireId"]),
  compliance: new Set([
    "from",
    "to",
    "branchId",
    "questionnaireId",
    "page",
    "pageSize",
  ]),
  history: new Set([
    "from",
    "to",
    "employeeId",
    "questionnaireId",
    "branchId",
    "page",
    "pageSize",
  ]),
} as const

type Role = "Administrador" | "Secretario"

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

async function stubAuth(page: Page, role: Role) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(loginPayload(role)),
    })
  })
}

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  })
}

/**
 * Authenticate on the currently loaded protected route so the route gate can
 * render the reports shell in the same document (in-memory access is preserved).
 */
async function loginOnCurrentRoute(page: Page, role: Role) {
  await stubAuth(page, role)

  const login = getLoginControls(page)
  await expect(login.heading).toBeVisible()
  await login.cedula.fill(LOGIN.CEDULA)
  await login.password.fill(LOGIN.PASSWORD)
  await login.submit.click()
}

/**
 * Assert the captured request URL only carries querystring parameters the
 * endpoint accepts. Any foreign parameter fails the report contract.
 */
function assertAllowedParams(url: URL, allowed: ReadonlySet<string>) {
  for (const key of url.searchParams.keys()) {
    expect(allowed, `unexpected query parameter "${key}"`).toContain(key)
  }
}

function pendingEntry(id: string) {
  return {
    employeeId: `emp-${id}`,
    employeeName: `Empleado ${id}`,
    branchId: "branch-1",
    branchName: "Central",
    questionnaireId: "q-1",
    questionnaireTitle: "Apertura diaria",
  }
}

function complianceDetail(page: number) {
  return {
    questionnaireId: "q-1",
    questionnaireTitle: "Apertura diaria",
    branchId: "branch-1",
    branchName: "Central",
    employeeId: `emp-p${page}`,
    employeeName: `Empleado página ${page}`,
    responded: page === 1,
    businessDay: "2024-01-01",
  }
}

function historyEntry(page: number) {
  return {
    id: `resp-p${page}`,
    employeeId: `emp-p${page}`,
    employeeName: `Empleado página ${page}`,
    questionnaireId: "q-1",
    questionnaireTitle: "Apertura diaria",
    versionId: "v-1",
    versionNumber: 1,
    businessDay: "2024-01-01",
    createdAt: "2024-01-01T08:00:00.000Z",
    answers: [],
  }
}

test.describe("Operational reports", () => {
  test("queries the pending report with its allowed filters", async ({ page }) => {
    const requests: URL[] = []

    await page.route("**/api/v1/reports/pending**", async (route) => {
      const url = new URL(route.request().url())
      requests.push(url)
      return fulfillJson(route, 200, {
        businessDay: url.searchParams.get("businessDay") ?? "2024-01-15",
        pending: [pendingEntry("1"), pendingEntry("2")],
      })
    })

    await page.goto("/operaciones/reportes")
    await loginOnCurrentRoute(page, "Administrador")

    await expect(
      page.getByRole("heading", { name: "Reportes", exact: true })
    ).toBeVisible()

    // Pending is the default report type; fill its required date + optional filters.
    const filters = page.getByRole("group", { name: "Filtros del reporte" })
    await filters.getByLabel("Día de negocio", { exact: false }).fill("2024-01-15")
    await filters.getByLabel("Sucursal (ID)", { exact: false }).fill("branch-1")
    await filters.getByLabel("Cuestionario (ID)", { exact: false }).fill("q-1")
    await filters.getByRole("button", { name: "Consultar", exact: true }).click()

    // Results present the settled payload for the selected business day.
    const results = page.getByRole("region", { name: "Empleados pendientes" })
    await expect(results).toBeVisible()
    await expect(results.getByText("Empleado 1", { exact: false })).toBeVisible()
    await expect(results.getByText("Empleado 2", { exact: false })).toBeVisible()

    // Exactly one request, carrying only the allowed pending parameters.
    expect(requests).toHaveLength(1)
    assertAllowedParams(requests[0], ALLOWED_PARAMS.pending)
    expect(requests[0].searchParams.get("businessDay")).toBe("2024-01-15")
    expect(requests[0].searchParams.get("branchId")).toBe("branch-1")
    expect(requests[0].searchParams.get("questionnaireId")).toBe("q-1")
  })

  test("queries compliance, shows pagination metadata, and advances a valid page", async ({
    page,
  }) => {
    const requests: URL[] = []

    await page.route("**/api/v1/reports/compliance**", async (route) => {
      const url = new URL(route.request().url())
      requests.push(url)
      const requestedPage = Number(url.searchParams.get("page") ?? "1")
      return fulfillJson(route, 200, {
        from: "2024-01-01",
        to: "2024-01-10",
        summary: {
          totalAssigned: 2,
          responded: 1,
          pending: 1,
          complianceRate: 50,
        },
        details: {
          items: [complianceDetail(requestedPage)],
          page: requestedPage,
          pageSize: 1,
          total: 2,
        },
      })
    })

    await page.goto("/operaciones/reportes")
    await loginOnCurrentRoute(page, "Administrador")

    await expect(
      page.getByRole("heading", { name: "Reportes", exact: true })
    ).toBeVisible()

    // Switch to the compliance report and query an in-range date window.
    await page.getByRole("button", { name: "Cumplimiento", exact: true }).click()
    const filters = page.getByRole("group", { name: "Filtros del reporte" })
    await filters.getByLabel("Desde", { exact: false }).fill("2024-01-01")
    await filters.getByLabel("Hasta", { exact: false }).fill("2024-01-10")
    await filters.getByRole("button", { name: "Consultar", exact: true }).click()

    // Summary + paginated detail region with page/pageSize/total metadata.
    await expect(page.getByText("Asignados", { exact: true })).toBeVisible()
    const details = page.getByRole("region", { name: "Detalle de cumplimiento" })
    await expect(details).toBeVisible()
    await expect(details.getByText("Empleado página 1", { exact: false })).toBeVisible()
    await expect(details.getByText("2 resultado(s)", { exact: false })).toBeVisible()

    const pagination = page.getByRole("navigation", {
      name: "Paginación de resultados",
    })
    await expect(pagination.getByText("Página 1 de 2", { exact: true })).toBeVisible()

    // Advance to the next valid page (page 2).
    await pagination.getByRole("button", { name: "Página siguiente", exact: true }).click()

    await expect(details.getByText("Empleado página 2", { exact: false })).toBeVisible()
    await expect(pagination.getByText("Página 2 de 2", { exact: true })).toBeVisible()

    // Two requests: initial page 1 and the advanced page 2; both allowed-only.
    expect(requests).toHaveLength(2)
    for (const url of requests) {
      assertAllowedParams(url, ALLOWED_PARAMS.compliance)
      expect(url.searchParams.get("from")).toBe("2024-01-01")
      expect(url.searchParams.get("to")).toBe("2024-01-10")
    }
    expect(requests[0].searchParams.get("page")).toBe("1")
    expect(requests[1].searchParams.get("page")).toBe("2")
  })

  test("queries history, shows pagination metadata, and advances a valid page", async ({
    page,
  }) => {
    const requests: URL[] = []

    await page.route("**/api/v1/reports/history**", async (route) => {
      const url = new URL(route.request().url())
      requests.push(url)
      const requestedPage = Number(url.searchParams.get("page") ?? "1")
      return fulfillJson(route, 200, {
        from: "2024-01-01",
        to: "2024-01-10",
        results: {
          items: [historyEntry(requestedPage)],
          page: requestedPage,
          pageSize: 1,
          total: 2,
        },
      })
    })

    await page.goto("/operaciones/reportes")
    await loginOnCurrentRoute(page, "Administrador")

    await expect(
      page.getByRole("heading", { name: "Reportes", exact: true })
    ).toBeVisible()

    // Switch to the history report; both dates are required.
    await page.getByRole("button", { name: "Historial", exact: true }).click()
    const filters = page.getByRole("group", { name: "Filtros del reporte" })
    await filters.getByLabel("Desde", { exact: false }).fill("2024-01-01")
    await filters.getByLabel("Hasta", { exact: false }).fill("2024-01-10")
    await filters.getByLabel("Empleado (ID)", { exact: false }).fill("emp-1")
    await filters.getByRole("button", { name: "Consultar", exact: true }).click()

    const results = page.getByRole("region", { name: "Historial de respuestas" })
    await expect(results).toBeVisible()
    await expect(results.getByText("Empleado página 1", { exact: false })).toBeVisible()
    await expect(results.getByText("2 resultado(s)", { exact: false })).toBeVisible()

    const pagination = page.getByRole("navigation", {
      name: "Paginación de resultados",
    })
    await expect(pagination.getByText("Página 1 de 2", { exact: true })).toBeVisible()

    // Advance to the next valid page (page 2).
    await pagination.getByRole("button", { name: "Página siguiente", exact: true }).click()

    await expect(results.getByText("Empleado página 2", { exact: false })).toBeVisible()
    await expect(pagination.getByText("Página 2 de 2", { exact: true })).toBeVisible()

    // Two requests: initial page 1 and the advanced page 2; both allowed-only.
    expect(requests).toHaveLength(2)
    for (const url of requests) {
      assertAllowedParams(url, ALLOWED_PARAMS.history)
      expect(url.searchParams.get("from")).toBe("2024-01-01")
      expect(url.searchParams.get("to")).toBe("2024-01-10")
      expect(url.searchParams.get("employeeId")).toBe("emp-1")
    }
    expect(requests[0].searchParams.get("page")).toBe("1")
    expect(requests[1].searchParams.get("page")).toBe("2")
  })
})
