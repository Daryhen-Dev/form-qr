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
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ACCESS_AVAILABILITY,
  ACCESS_ROLE,
  AccessProvider,
  useAccess,
  type AccessContext,
  type AccessRole,
} from "@/components/access/access-provider"
import { ReportsView } from "@/components/operational/reports/reports-view"
import type {
  ComplianceDetailDTO,
  ComplianceReportDTO,
  PendingEntryDTO,
  PendingReportDTO,
} from "@/lib/operational-api/contracts"

/**
 * Reports surface UI behaviour (RTL/jsdom).
 *
 * Exercises `ReportsView` and its `ReportFilters`, `PaginatedResults` and
 * `Pagination` children with a mocked `fetch` and an available Administrador
 * access context, covering:
 *   - Allowed filters per report type: pending, compliance and history each
 *     render ONLY the parameters their endpoint accepts (Requirements 6.1,
 *     6.3, 6.4, 6.5).
 *   - Real calendar dates and the inclusive 31-day range cap are validated
 *     client-side before any request is issued (Requirements 6.2, 6.4, 6.5).
 *   - Pagination presents the page/pageSize/total metadata and only ever
 *     requests a valid page (Requirement 6.6).
 *   - HTTP 422 preserves the entered filters, associates identifiable issues
 *     with their controls via `aria-invalid` / `aria-describedby`, and shows a
 *     single safe general message for unassociated issues without leaking the
 *     response body (Requirements 6.7, 7.6, 7.8).
 *   - Accessible status regions (`role="status"` + `aria-live`) and control
 *     names (Requirements 9.3, 9.4).
 */

// --- Fixtures ---------------------------------------------------------------

const LEAK_MARKER = "INTERNAL_LEAK_MUST_NOT_RENDER"

const GENERAL_VALIDATION_MESSAGE = "Revisá los campos marcados e intentá nuevamente."
const FIELD_ISSUE_MESSAGE = "Revisá este campo."
const SUCCESS_MESSAGE = "Operación completada."
const INVALID_DATE_MESSAGE = "Ingresá una fecha válida (día calendario real)."
const INVALID_RANGE_MESSAGE = "El rango no puede superar 31 días."

function makeAccess(role: AccessRole): AccessContext {
  return {
    accessToken: "access-token-must-not-render",
    principalId: "principal-must-not-render",
    role,
    availability: ACCESS_AVAILABILITY.AVAILABLE,
  }
}

function makePendingEntry(
  overrides: Partial<PendingEntryDTO> = {}
): PendingEntryDTO {
  return {
    employeeId: "emp-1",
    employeeName: "Ana Lopez",
    branchId: "branch-1",
    branchName: "Sucursal Centro",
    questionnaireId: "quest-1",
    questionnaireTitle: "Apertura diaria",
    ...overrides,
  }
}

function makePendingReport(
  overrides: Partial<PendingReportDTO> = {}
): PendingReportDTO {
  return {
    businessDay: "2024-01-01",
    pending: [makePendingEntry()],
    ...overrides,
  }
}

function makeComplianceDetail(
  overrides: Partial<ComplianceDetailDTO> = {}
): ComplianceDetailDTO {
  return {
    questionnaireId: "quest-1",
    questionnaireTitle: "Apertura diaria",
    branchId: "branch-1",
    branchName: "Sucursal Centro",
    employeeId: "emp-1",
    employeeName: "Ana Lopez",
    responded: true,
    businessDay: "2024-01-01",
    ...overrides,
  }
}

function makeComplianceReport(
  page: number,
  overrides: Partial<ComplianceReportDTO> = {}
): ComplianceReportDTO {
  return {
    from: "2024-01-01",
    to: "2024-01-15",
    summary: {
      totalAssigned: 10,
      responded: 6,
      pending: 4,
      complianceRate: 60,
    },
    details: {
      items: [
        makeComplianceDetail({ employeeId: `emp-${page}-a` }),
        makeComplianceDetail({ employeeId: `emp-${page}-b`, responded: false }),
      ],
      page,
      pageSize: 2,
      total: 5,
    },
    ...overrides,
  }
}

// --- fetch routing mock -----------------------------------------------------

interface RouteHandler {
  (url: string, init?: RequestInit): Response | Promise<Response>
}

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

type FetchCall = Parameters<typeof fetch>

function installFetch(routes: Record<string, RouteHandler>) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : String(input)

      for (const [path, handle] of Object.entries(routes)) {
        if (url.includes(path)) {
          return handle(url, init)
        }
      }

      throw new Error(`Unexpected fetch: ${url}`)
    }
  )

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function requestedUrls(fetchMock: ReturnType<typeof installFetch>): string[] {
  return fetchMock.mock.calls.map((call: FetchCall) => {
    const [input] = call
    return typeof input === "string" ? input : String(input)
  })
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

function renderReports(role: AccessRole = ACCESS_ROLE.ADMINISTRADOR) {
  return render(
    <AccessProvider>
      <AccessState access={makeAccess(role)}>
        <ReportsView />
      </AccessState>
    </AccessProvider>
  )
}

/** Sets a controlled input's value through a native change event. */
function setInput(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// --- Allowed filters per report type ----------------------------------------

describe("ReportsView — filtros permitidos por tipo de reporte", () => {
  it("pendientes ofrece sólo businessDay, branchId y questionnaireId", () => {
    installFetch({})
    renderReports()

    expect(screen.getByLabelText(/Día de negocio/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Sucursal \(ID\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Cuestionario \(ID\)/)).toBeInTheDocument()

    // Filters that belong to other report types are not offered.
    expect(screen.queryByLabelText(/Desde/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Hasta/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Empleado \(ID\)/)).not.toBeInTheDocument()
  })

  it("cumplimiento ofrece from/to y filtros, sin businessDay ni empleado", async () => {
    installFetch({})
    const user = userEvent.setup()
    renderReports()

    await user.click(screen.getByRole("button", { name: "Cumplimiento" }))

    expect(screen.getByLabelText(/Desde/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Hasta/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Sucursal \(ID\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Cuestionario \(ID\)/)).toBeInTheDocument()

    expect(screen.queryByLabelText(/Día de negocio/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Empleado \(ID\)/)).not.toBeInTheDocument()
  })

  it("historial ofrece from/to, empleado y filtros, sin businessDay", async () => {
    installFetch({})
    const user = userEvent.setup()
    renderReports()

    await user.click(screen.getByRole("button", { name: "Historial" }))

    expect(screen.getByLabelText(/Desde/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Hasta/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Empleado \(ID\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Sucursal \(ID\)/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Cuestionario \(ID\)/)).toBeInTheDocument()

    expect(screen.queryByLabelText(/Día de negocio/)).not.toBeInTheDocument()
  })
})

// --- Client-side date / range validation ------------------------------------

describe("ReportsView — validación de fecha real y rango", () => {
  it("bloquea la consulta y marca el control cuando falta una fecha requerida", async () => {
    const fetchMock = installFetch({})
    const user = userEvent.setup()
    renderReports()

    // Submit pending with an empty (non-real) businessDay.
    await user.click(screen.getByRole("button", { name: "Consultar" }))

    const error = await screen.findByText(INVALID_DATE_MESSAGE)
    expect(error).toBeInTheDocument()

    const businessDay = screen.getByLabelText(/Día de negocio/)
    expect(businessDay).toHaveAttribute("aria-invalid", "true")
    expect(businessDay).toHaveAccessibleDescription(INVALID_DATE_MESSAGE)

    // No request is issued while client validation fails.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("rechaza un rango inclusivo mayor a 31 días sin emitir la solicitud", async () => {
    const fetchMock = installFetch({})
    const user = userEvent.setup()
    renderReports()

    await user.click(screen.getByRole("button", { name: "Cumplimiento" }))
    setInput(/Desde/, "2024-01-01")
    setInput(/Hasta/, "2024-03-01") // 60 inclusive days > 31.

    await user.click(screen.getByRole("button", { name: "Consultar" }))

    const error = await screen.findByText(INVALID_RANGE_MESSAGE)
    expect(error).toBeInTheDocument()

    const to = screen.getByLabelText(/Hasta/)
    expect(to).toHaveAttribute("aria-invalid", "true")
    expect(to).toHaveAccessibleDescription(INVALID_RANGE_MESSAGE)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("emite una sola solicitud cuando las fechas son válidas", async () => {
    const fetchMock = installFetch({
      "/reports/pending": () => jsonResponse(200, makePendingReport()),
    })
    const user = userEvent.setup()
    renderReports()

    setInput(/Día de negocio/, "2024-01-01")
    await user.click(screen.getByRole("button", { name: "Consultar" }))

    await screen.findByText("Ana Lopez")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestedUrls(fetchMock)[0]).toContain("businessDay=2024-01-01")
  })
})

// --- Pagination -------------------------------------------------------------

describe("ReportsView — paginación", () => {
  it("presenta los metadatos y solicita una página válida al avanzar", async () => {
    const fetchMock = installFetch({
      "/reports/compliance": (url) => {
        const page = url.includes("page=2") ? 2 : 1
        return jsonResponse(200, makeComplianceReport(page))
      },
    })
    const user = userEvent.setup()
    renderReports()

    await user.click(screen.getByRole("button", { name: "Cumplimiento" }))
    setInput(/Desde/, "2024-01-01")
    setInput(/Hasta/, "2024-01-15")
    await user.click(screen.getByRole("button", { name: "Consultar" }))

    // Pagination metadata reported by the API is presented.
    await screen.findByText(/5 resultado\(s\)/)
    expect(screen.getByText(/2 por página/)).toBeInTheDocument()
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument()

    // At the first page the previous control is disabled.
    expect(
      screen.getByRole("button", { name: "Página anterior" })
    ).toBeDisabled()

    // Advancing requests page 2 — a page within the valid range.
    await user.click(screen.getByRole("button", { name: "Página siguiente" }))

    await screen.findByText("Página 2 de 3")
    const urls = requestedUrls(fetchMock)
    expect(urls.some((url) => url.includes("page=2"))).toBe(true)
    expect(urls.every((url) => url.includes("from=2024-01-01"))).toBe(true)
  })
})

// --- HTTP 422 ---------------------------------------------------------------

describe("ReportsView — HTTP 422", () => {
  it("conserva los filtros y asocia el problema con el control identificable", async () => {
    installFetch({
      "/reports/pending": () =>
        jsonResponse(422, {
          issues: [{ path: ["businessDay"], message: LEAK_MARKER }],
        }),
    })
    const user = userEvent.setup()
    renderReports()

    setInput(/Día de negocio/, "2024-01-01")
    setInput(/Sucursal \(ID\)/, "branch-77")
    await user.click(screen.getByRole("button", { name: "Consultar" }))

    // The identifiable issue is associated with its control.
    const businessDay = await screen.findByLabelText(/Día de negocio/)
    await waitFor(() =>
      expect(businessDay).toHaveAttribute("aria-invalid", "true")
    )
    expect(businessDay).toHaveAttribute(
      "aria-describedby",
      "report-businessDay-error"
    )
    expect(businessDay).toHaveAccessibleDescription(FIELD_ISSUE_MESSAGE)

    // Non-sensitive filters entered are preserved for correction.
    expect(businessDay).toHaveValue("2024-01-01")
    expect(screen.getByLabelText(/Sucursal \(ID\)/)).toHaveValue("branch-77")

    // An associated issue does not also raise a general status message, and the
    // raw response body never leaks.
    expect(screen.queryByText(GENERAL_VALIDATION_MESSAGE)).not.toBeInTheDocument()
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })

  it("muestra un único mensaje general seguro para problemas no asociados", async () => {
    installFetch({
      "/reports/pending": () =>
        jsonResponse(422, {
          issues: [{ path: ["internalOnlyField"], message: LEAK_MARKER }],
        }),
    })
    const user = userEvent.setup()
    renderReports()

    setInput(/Día de negocio/, "2024-01-01")
    await user.click(screen.getByRole("button", { name: "Consultar" }))

    const general = await screen.findAllByText(GENERAL_VALIDATION_MESSAGE)
    expect(general).toHaveLength(1)
    expect(general[0]).toHaveAttribute("role", "status")
    expect(general[0]).toHaveAttribute("aria-live", "polite")

    // Entered filters are preserved and the response body never leaks.
    expect(screen.getByLabelText(/Día de negocio/)).toHaveValue("2024-01-01")
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- Accessible status regions & control names ------------------------------

describe("ReportsView — regiones de estado accesibles y ARIA", () => {
  it("agrupa los filtros y el selector de tipo con nombres accesibles", () => {
    installFetch({})
    renderReports()

    expect(
      screen.getByRole("group", { name: "Tipo de reporte" })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("group", { name: "Filtros del reporte" })
    ).toBeInTheDocument()
  })

  it("anuncia el éxito mediante una región de estado accesible", async () => {
    installFetch({
      "/reports/pending": () => jsonResponse(200, makePendingReport()),
    })
    const user = userEvent.setup()
    renderReports()

    setInput(/Día de negocio/, "2024-01-01")
    await user.click(screen.getByRole("button", { name: "Consultar" }))

    const status = await screen.findByText(SUCCESS_MESSAGE)
    expect(status).toHaveAttribute("role", "status")
    expect(status).toHaveAttribute("aria-live", "polite")

    // The pending results region is labelled for assistive technology.
    const region = screen.getByRole("region", { name: "Empleados pendientes" })
    expect(within(region).getByText("Ana Lopez")).toBeInTheDocument()
  })

  it("expone controles de paginación con nombres accesibles dentro de una navegación", async () => {
    installFetch({
      "/reports/compliance": () => jsonResponse(200, makeComplianceReport(1)),
    })
    const user = userEvent.setup()
    renderReports()

    await user.click(screen.getByRole("button", { name: "Cumplimiento" }))
    setInput(/Desde/, "2024-01-01")
    setInput(/Hasta/, "2024-01-15")
    await user.click(screen.getByRole("button", { name: "Consultar" }))

    const nav = await screen.findByRole("navigation", {
      name: "Paginación de resultados",
    })
    expect(
      within(nav).getByRole("button", { name: "Página anterior" })
    ).toBeInTheDocument()
    expect(
      within(nav).getByRole("button", { name: "Página siguiente" })
    ).toBeInTheDocument()
  })
})
