import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect, useState, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ACCESS_AVAILABILITY,
  ACCESS_ROLE,
  AccessProvider,
  useAccess,
  type AccessContext,
  type AccessRole,
} from "@/components/access/access-provider"
import { BranchAssignmentPanel } from "@/components/operational/questionnaires/branch-assignment-panel"
import { QuestionnaireEditor } from "@/components/operational/questionnaires/editor"
import { QrPanel } from "@/components/operational/questionnaires/qr-panel"
import { QuestionBuilder } from "@/components/operational/questionnaires/question-builder"
import { VersionEditor } from "@/components/operational/questionnaires/version-editor"
import type { QuestionDraft } from "@/lib/operational-api/questionnaire-draft"
import {
  QUESTION_TYPE,
  VERSION_STATUS,
  type BranchDTO,
  type QrDTO,
  type QuestionDTO,
  type QuestionnaireVersionDTO,
} from "@/lib/types"

/**
 * Questionnaires + QR UI behaviour (RTL/jsdom).
 *
 * Exercises the questionnaires editor, version editor, question builder, branch
 * assignment panel, and QR panel with a mocked `fetch` scoped to
 * `/api/v1/questionnaires/**` and a role-scoped access context, covering:
 *   - Question editing across the eleven question-type configurations
 *     (Requirement 4.3).
 *   - HTTP 409 / 422: issues associated with controls via `aria-invalid` /
 *     `aria-describedby`, plus a single safe general message for unassociated
 *     issues (Requirements 4.7, 7.5, 7.6, 7.8, 8.3, 8.4, 9.3).
 *   - QR: fetching and displaying the QR image and scan link exactly as the API
 *     delivers them (Requirement 4.6).
 *   - Accessible status regions: `role="status"` with `aria-live`
 *     (Requirement 9.4).
 *   - Publishing reflects EXCLUSIVELY the API result, never an optimistic guess
 *     (Requirement 4.4).
 */

const QUESTIONNAIRE_ID = "q-1"
const VERSION_ID = "v-1"
const LEAK_MARKER = "INTERNAL_LEAK_MUST_NOT_RENDER"

// --- Fixtures ---------------------------------------------------------------

function makeAccess(role: AccessRole): AccessContext {
  return {
    accessToken: "access-token-must-not-render",
    principalId: "principal-must-not-render",
    role,
    availability: ACCESS_AVAILABILITY.AVAILABLE,
  }
}

function makeVersion(
  overrides: Partial<QuestionnaireVersionDTO> = {}
): QuestionnaireVersionDTO {
  return {
    id: VERSION_ID,
    questionnaireId: QUESTIONNAIRE_ID,
    versionNumber: 1,
    status: VERSION_STATUS.DRAFT,
    publishedAt: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeQuestion(overrides: Partial<QuestionDTO> = {}): QuestionDTO {
  return {
    id: "question-1",
    order: 1,
    type: QUESTION_TYPE.SHORT_TEXT,
    prompt: "¿Todo en orden?",
    required: true,
    config: {},
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

function makeQr(overrides: Partial<QrDTO> = {}): QrDTO {
  return {
    qrToken: "qr-token-abc",
    scanUrl: "https://form-qr.example/scan/qr-token-abc",
    qrSvg: '<svg role="presentation"><rect width="10" height="10" /></svg>',
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

/**
 * Installs a `fetch` mock that resolves the FIRST matching route by method and
 * URL substring. Routes MUST be ordered most-specific first so that, for
 * example, `.../versions/v-1/publish` is matched before `.../versions`.
 */
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

type FetchMock = ReturnType<typeof installFetch>

function callsMatching(
  fetchMock: FetchMock,
  method: string,
  pathIncludes: string
): [RequestInfo | URL, RequestInit?][] {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = typeof input === "string" ? input : String(input)
    return (
      (init?.method ?? "GET").toUpperCase() === method &&
      url.includes(pathIncludes)
    )
  })
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  return init?.body === undefined || init?.body === null
    ? {}
    : (JSON.parse(String(init.body)) as Record<string, unknown>)
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

function renderWithAccess(
  ui: ReactNode,
  role: AccessRole = ACCESS_ROLE.ADMINISTRADOR
) {
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

// --- Question editing: the eleven type configurations -----------------------

/** Controlled harness so the builder's `onDraftsChange` round-trips locally. */
function ControlledBuilder() {
  const [drafts, setDrafts] = useState<readonly QuestionDraft[]>([
    {
      clientKey: "draft-key-1",
      order: 1,
      type: QUESTION_TYPE.BOOLEAN,
      prompt: "",
      required: false,
      config: {},
    },
  ])

  return <QuestionBuilder drafts={drafts} onDraftsChange={setDrafts} />
}

describe("QuestionBuilder — 11 configuraciones de tipo", () => {
  it("ofrece exactamente los once tipos de pregunta", () => {
    render(<ControlledBuilder />)

    const typeSelect = screen.getByLabelText("Tipo")
    const options = within(typeSelect).getAllByRole("option")

    expect(options).toHaveLength(11)
    expect(options.map((option) => option.getAttribute("value"))).toEqual([
      QUESTION_TYPE.BOOLEAN,
      QUESTION_TYPE.SINGLE_CHOICE,
      QUESTION_TYPE.MULTIPLE_CHOICE,
      QUESTION_TYPE.SCALE,
      QUESTION_TYPE.SHORT_TEXT,
      QUESTION_TYPE.LONG_TEXT,
      QUESTION_TYPE.NUMBER,
      QUESTION_TYPE.DATE,
      QUESTION_TYPE.TIME,
      QUESTION_TYPE.PHOTO,
      QUESTION_TYPE.FILE,
    ])
  })

  it("boolean/date/time no exponen configuración adicional", async () => {
    const user = userEvent.setup()
    render(<ControlledBuilder />)
    const typeSelect = screen.getByLabelText("Tipo")

    for (const bareType of [
      QUESTION_TYPE.BOOLEAN,
      QUESTION_TYPE.DATE,
      QUESTION_TYPE.TIME,
    ]) {
      await user.selectOptions(typeSelect, bareType)
      expect(screen.getByLabelText("Tipo")).toHaveValue(bareType)
      expect(screen.queryByRole("group", { name: "Opciones" })).toBeNull()
      expect(screen.queryByLabelText("Longitud máxima")).toBeNull()
      expect(screen.queryByLabelText("Patrón de clave de objeto")).toBeNull()
    }
  })

  it("single_choice y multiple_choice exponen opciones; multiple añade cotas de selección", async () => {
    const user = userEvent.setup()
    render(<ControlledBuilder />)
    const typeSelect = screen.getByLabelText("Tipo")

    await user.selectOptions(typeSelect, QUESTION_TYPE.SINGLE_CHOICE)
    expect(screen.getByRole("group", { name: "Opciones" })).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Agregar opción" })
    ).toBeInTheDocument()
    expect(screen.queryByLabelText("Mínimo seleccionable")).toBeNull()

    await user.selectOptions(typeSelect, QUESTION_TYPE.MULTIPLE_CHOICE)
    expect(screen.getByRole("group", { name: "Opciones" })).toBeInTheDocument()
    expect(screen.getByLabelText("Mínimo seleccionable")).toBeInTheDocument()
    expect(screen.getByLabelText("Máximo seleccionable")).toBeInTheDocument()
  })

  it("scale expone mínimo, máximo y paso con valores por defecto válidos", async () => {
    const user = userEvent.setup()
    render(<ControlledBuilder />)

    await user.selectOptions(screen.getByLabelText("Tipo"), QUESTION_TYPE.SCALE)

    expect(screen.getByLabelText("Mínimo")).toHaveValue(1)
    expect(screen.getByLabelText("Máximo")).toHaveValue(5)
    expect(screen.getByLabelText("Paso")).toHaveValue(1)
  })

  it("short_text y long_text exponen la longitud máxima", async () => {
    const user = userEvent.setup()
    render(<ControlledBuilder />)
    const typeSelect = screen.getByLabelText("Tipo")

    await user.selectOptions(typeSelect, QUESTION_TYPE.SHORT_TEXT)
    expect(screen.getByLabelText("Longitud máxima")).toBeInTheDocument()

    await user.selectOptions(typeSelect, QUESTION_TYPE.LONG_TEXT)
    expect(screen.getByLabelText("Longitud máxima")).toBeInTheDocument()
  })

  it("number expone mínimo y máximo", async () => {
    const user = userEvent.setup()
    render(<ControlledBuilder />)

    await user.selectOptions(screen.getByLabelText("Tipo"), QUESTION_TYPE.NUMBER)

    expect(screen.getByLabelText("Mínimo")).toBeInTheDocument()
    expect(screen.getByLabelText("Máximo")).toBeInTheDocument()
  })

  it("photo y file exponen el patrón de clave de objeto", async () => {
    const user = userEvent.setup()
    render(<ControlledBuilder />)
    const typeSelect = screen.getByLabelText("Tipo")

    await user.selectOptions(typeSelect, QUESTION_TYPE.PHOTO)
    expect(
      screen.getByLabelText("Patrón de clave de objeto")
    ).toBeInTheDocument()

    await user.selectOptions(typeSelect, QUESTION_TYPE.FILE)
    expect(
      screen.getByLabelText("Patrón de clave de objeto")
    ).toBeInTheDocument()
  })
})

// --- QuestionnaireEditor — HTTP 409 -----------------------------------------

describe("QuestionnaireEditor — HTTP 409", () => {
  it("conserva los datos no sensibles, libera la operación y anuncia un mensaje seguro", async () => {
    installFetch([
      {
        method: "GET",
        path: "/questionnaires",
        handle: () => jsonResponse(200, { questionnaires: [] }),
      },
      {
        method: "POST",
        path: "/questionnaires",
        handle: () => jsonResponse(409, { message: LEAK_MARKER }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<QuestionnaireEditor />)

    await user.click(
      await screen.findByRole("button", { name: "Nuevo cuestionario" })
    )
    await user.type(screen.getByLabelText("Título"), "Diario matutino")
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    const status = await screen.findByText(
      "Los datos cambiaron. Revisá la información e intentá nuevamente."
    )
    expect(status).toHaveAttribute("role", "status")
    expect(status).toHaveAttribute("aria-live", "polite")

    // Non-sensitive draft preserved for correction, operation released.
    expect(screen.getByLabelText("Título")).toHaveValue("Diario matutino")
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled()

    // No internal failure detail leaks into the DOM.
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- QuestionnaireEditor — HTTP 422 -----------------------------------------

describe("QuestionnaireEditor — HTTP 422", () => {
  it("asocia el problema con el control mediante aria-invalid y aria-describedby", async () => {
    installFetch([
      {
        method: "GET",
        path: "/questionnaires",
        handle: () => jsonResponse(200, { questionnaires: [] }),
      },
      {
        method: "POST",
        path: "/questionnaires",
        handle: () =>
          jsonResponse(422, {
            issues: [{ path: ["title"], message: LEAK_MARKER }],
          }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<QuestionnaireEditor />)

    await user.click(
      await screen.findByRole("button", { name: "Nuevo cuestionario" })
    )
    await user.type(screen.getByLabelText("Título"), "Diario matutino")
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    const title = await screen.findByLabelText("Título")
    await waitFor(() => expect(title).toHaveAttribute("aria-invalid", "true"))
    expect(title).toHaveAttribute("aria-describedby", "questionnaire-title-error")
    expect(title).toHaveAccessibleDescription("Revisá este campo.")

    const fieldError = screen.getByText("Revisá este campo.")
    expect(fieldError).toHaveAttribute("aria-live", "assertive")

    // The associated issue produces no general status and no leak.
    expect(
      screen.queryByText("Revisá los campos marcados e intentá nuevamente.")
    ).toBeNull()
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })

  it("muestra un único mensaje general seguro para los problemas no asociados", async () => {
    installFetch([
      {
        method: "GET",
        path: "/questionnaires",
        handle: () => jsonResponse(200, { questionnaires: [] }),
      },
      {
        method: "POST",
        path: "/questionnaires",
        handle: () =>
          jsonResponse(422, {
            issues: [{ path: ["internalOnlyField"], message: LEAK_MARKER }],
          }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<QuestionnaireEditor />)

    await user.click(
      await screen.findByRole("button", { name: "Nuevo cuestionario" })
    )
    await user.type(screen.getByLabelText("Título"), "Diario matutino")
    await user.click(screen.getByRole("button", { name: "Guardar" }))

    const general = await screen.findAllByText(
      "Revisá los campos marcados e intentá nuevamente."
    )
    expect(general).toHaveLength(1)
    expect(general[0]).toHaveAttribute("role", "status")
    expect(general[0]).toHaveAttribute("aria-live", "polite")

    // No unmapped issue associates a control, and nothing internal leaks.
    expect(screen.getByLabelText("Título")).not.toHaveAttribute("aria-invalid")
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- VersionEditor — publish reflects only the API result -------------------

function installVersionRoutes(publishHandler: () => Response) {
  const draft = makeVersion()
  return installFetch([
    {
      // POST publish is the most specific POST — it must be matched first.
      method: "POST",
      path: `/questionnaires/${QUESTIONNAIRE_ID}/versions/${VERSION_ID}/publish`,
      handle: publishHandler,
    },
    {
      method: "GET",
      path: `/questionnaires/${QUESTIONNAIRE_ID}/versions/${VERSION_ID}`,
      handle: () =>
        jsonResponse(200, { version: { ...draft, questions: [] } }),
    },
    {
      method: "GET",
      path: `/questionnaires/${QUESTIONNAIRE_ID}/versions`,
      handle: () => jsonResponse(200, { versions: [draft] }),
    },
  ])
}

async function openDraftVersion(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Abrir versión 1" }))
  // The level-4 detail heading confirms the version-with-questions loaded
  // (the same label also appears in the version list item).
  await screen.findByRole("heading", { level: 4, name: "Versión 1 · Borrador" })
}

describe("VersionEditor — publicar refleja sólo el resultado del API", () => {
  it("muestra el estado publicado devuelto por el API", async () => {
    installVersionRoutes(() =>
      jsonResponse(200, {
        version: makeVersion({
          status: VERSION_STATUS.PUBLISHED,
          publishedAt: "2024-02-01T00:00:00.000Z",
        }),
      })
    )

    const user = userEvent.setup()
    renderWithAccess(<VersionEditor questionnaireId={QUESTIONNAIRE_ID} />)
    await openDraftVersion(user)

    await user.click(screen.getByRole("button", { name: "Publicar versión" }))

    // Status mirrors the API result: the version becomes read-only.
    await screen.findByRole("heading", {
      level: 4,
      name: "Versión 1 · Publicada",
    })
    expect(
      screen.getByText("Esta versión está publicada y no puede modificarse.")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Publicar versión" })
    ).toBeNull()
  })

  it("no deriva el estado de forma optimista: conserva el estado devuelto", async () => {
    // The publish call succeeds but the API returns a still-draft version. The
    // UI must reflect EXACTLY that, never an optimistic "published" guess.
    installVersionRoutes(() =>
      jsonResponse(200, { version: makeVersion({ status: VERSION_STATUS.DRAFT }) })
    )

    const user = userEvent.setup()
    renderWithAccess(<VersionEditor questionnaireId={QUESTIONNAIRE_ID} />)
    await openDraftVersion(user)

    await user.click(screen.getByRole("button", { name: "Publicar versión" }))

    // The success status region confirms the call settled...
    await screen.findByText("Operación completada.")
    // ...yet the displayed status stays "Borrador" and the version editable.
    expect(
      screen.getByRole("heading", { level: 4, name: "Versión 1 · Borrador" })
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Esta versión está publicada y no puede modificarse.")
    ).toBeNull()
  })
})

// --- VersionEditor — saving a draft sends the full ordered question set ------

describe("VersionEditor — guardar el conjunto completo de preguntas", () => {
  it("envía un PATCH con las preguntas ordenadas y refleja el resultado del API", async () => {
    const draft = makeVersion()
    const saved = makeQuestion({ prompt: "Pregunta guardada" })

    const fetchMock = installFetch([
      {
        method: "PATCH",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/versions/${VERSION_ID}`,
        handle: () =>
          jsonResponse(200, {
            version: { ...draft, questions: [saved] },
          }),
      },
      {
        method: "GET",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/versions/${VERSION_ID}`,
        handle: () =>
          jsonResponse(200, { version: { ...draft, questions: [] } }),
      },
      {
        method: "GET",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/versions`,
        handle: () => jsonResponse(200, { versions: [draft] }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<VersionEditor questionnaireId={QUESTIONNAIRE_ID} />)
    await openDraftVersion(user)

    await user.click(screen.getByRole("button", { name: "Agregar pregunta" }))
    await user.type(screen.getByLabelText("Enunciado"), "Nueva pregunta")
    await user.click(screen.getByRole("button", { name: "Guardar preguntas" }))

    await screen.findByText("Operación completada.")

    const patchCalls = callsMatching(
      fetchMock,
      "PATCH",
      `/questionnaires/${QUESTIONNAIRE_ID}/versions/${VERSION_ID}`
    )
    expect(patchCalls).toHaveLength(1)

    const body = parseBody(patchCalls[0][1])
    const questions = body.questions as { order: number; type: string }[]
    expect(questions).toHaveLength(1)
    expect(questions[0].order).toBe(1)
    expect(questions[0].type).toBe(QUESTION_TYPE.BOOLEAN)

    // The persisted, API-returned prompt is reflected back into the editor.
    expect(screen.getByLabelText("Enunciado")).toHaveValue("Pregunta guardada")
  })
})

// --- BranchAssignmentPanel — HTTP 422 associates the control ----------------

describe("BranchAssignmentPanel — HTTP 422", () => {
  it("asocia el problema con el selector de sucursal mediante ARIA", async () => {
    installFetch([
      {
        method: "GET",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/branches`,
        handle: () => jsonResponse(200, { assignments: [] }),
      },
      {
        method: "POST",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/branches`,
        handle: () =>
          jsonResponse(422, {
            issues: [{ path: ["branchId"], message: LEAK_MARKER }],
          }),
      },
      {
        method: "GET",
        path: "/branches",
        handle: () => jsonResponse(200, { branches: [makeBranch()] }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(
      <BranchAssignmentPanel questionnaireId={QUESTIONNAIRE_ID} />
    )

    const select = await screen.findByLabelText("Sucursal")
    await user.selectOptions(select, "branch-1")
    await user.click(screen.getByRole("button", { name: "Asignar sucursal" }))

    await waitFor(() => expect(select).toHaveAttribute("aria-invalid", "true"))
    expect(select).toHaveAttribute(
      "aria-describedby",
      "questionnaire-branch-error"
    )
    expect(select).toHaveAccessibleDescription("Revisá este campo.")
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- QrPanel — fetch and display --------------------------------------------

describe("QrPanel — obtener y mostrar el QR", () => {
  it("obtiene el QR y presenta la imagen y el enlace devueltos por el API", async () => {
    const qr = makeQr()
    installFetch([
      {
        method: "GET",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/qr`,
        handle: () => jsonResponse(200, { qr }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<QrPanel questionnaireId={QUESTIONNAIRE_ID} />)

    // Nothing is derived optimistically: no QR before the request settles.
    expect(
      screen.queryByRole("img", { name: "Imagen del código QR" })
    ).toBeNull()

    await user.click(screen.getByRole("button", { name: "Obtener QR" }))

    const image = await screen.findByRole("img", {
      name: "Imagen del código QR",
    })
    expect(image.innerHTML).toContain("<svg")

    const link = screen.getByRole("link", { name: qr.scanUrl })
    expect(link).toHaveAttribute("href", qr.scanUrl)
  })

  it("no muestra QR y anuncia un mensaje seguro cuando el API falla", async () => {
    const fetchMock = installFetch([
      {
        method: "GET",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/qr`,
        handle: () => jsonResponse(500, { message: LEAK_MARKER }),
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<QrPanel questionnaireId={QUESTIONNAIRE_ID} />)

    await user.click(screen.getByRole("button", { name: "Obtener QR" }))

    const status = await screen.findByText(
      "No se pudo completar la operación. Intentá nuevamente."
    )
    expect(status).toHaveAttribute("role", "status")
    expect(
      screen.queryByRole("img", { name: "Imagen del código QR" })
    ).toBeNull()

    // The operation is released for retry and nothing internal leaks.
    expect(screen.getByRole("button", { name: "Obtener QR" })).toBeEnabled()
    expect(callsMatching(fetchMock, "GET", "/qr")).toHaveLength(1)
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- Single pending operation per QR fetch ----------------------------------

describe("QrPanel — doble activación", () => {
  it("mantiene una sola solicitud pendiente por operación", async () => {
    const gate = deferred<void>()
    const fetchMock = installFetch([
      {
        method: "GET",
        path: `/questionnaires/${QUESTIONNAIRE_ID}/qr`,
        handle: async () => {
          await gate.promise
          return jsonResponse(200, { qr: makeQr() })
        },
      },
    ])

    const user = userEvent.setup()
    renderWithAccess(<QrPanel questionnaireId={QUESTIONNAIRE_ID} />)

    await user.click(screen.getByRole("button", { name: "Obtener QR" }))

    const pending = await screen.findByRole("button", { name: "Obteniendo…" })
    expect(pending).toBeDisabled()
    expect(callsMatching(fetchMock, "GET", "/qr")).toHaveLength(1)

    // A second activation while pending must not dispatch another request.
    fireEvent.click(pending)
    expect(callsMatching(fetchMock, "GET", "/qr")).toHaveLength(1)

    gate.resolve()
    await screen.findByRole("img", { name: "Imagen del código QR" })
    expect(callsMatching(fetchMock, "GET", "/qr")).toHaveLength(1)
  })
})
