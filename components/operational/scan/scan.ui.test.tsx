import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect, type ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ACCESS_AVAILABILITY,
  AccessProvider,
  useAccess,
  type AccessContext,
} from "@/components/access/access-provider"
import { DynamicResponseForm } from "@/components/operational/scan/dynamic-response-form"
import { QuestionControl } from "@/components/operational/scan/question-control"
import { ScanResolver } from "@/components/operational/scan/scan-resolver"
import {
  QUESTION_TYPE,
  RESPONSE_STATUS,
  ROLE,
  VERSION_STATUS,
  type QuestionDTO,
  type QuestionnaireVersionDTO,
  type ResponseDTO,
  type ResponseStatus,
  type ScanResolutionDTO,
} from "@/lib/types"

/**
 * Employee scan flow UI behaviour (RTL/jsdom).
 *
 * Exercises the scan components (`ScanResolver`, `DynamicResponseForm`,
 * `QuestionControl`, `UploadField`) with a mocked `fetch` for
 * `GET /api/v1/scan/:qrToken`, `POST/PATCH /api/v1/responses`,
 * `POST /api/v1/uploads/presign`, and the external pre-signed `PUT`, covering:
 *   - The eleven question types render an accessible control that respects the
 *     received type/configuration and surfaces the mandatory character
 *     (Requirements 5.1, 5.2).
 *   - The `absent | editable | read_only` states: `read_only` disables every
 *     control, hides submit, and keeps uploads inactive (Requirements 5.3–5.5).
 *   - The `photo`/`file` upload flow: presign (protected) → PUT to the returned
 *     URL WITHOUT Authorization → only the server `objectKey` is stored and sent
 *     (Requirement 5.6).
 *   - HTTP 409 re-resolves the QR link so only the action allowed by the new
 *     status stays enabled (Requirements 5.7, 7.5).
 *   - HTTP 422 shows a single safe general message and preserves non-sensitive
 *     values (Requirements 5.8, 7.6, 7.8).
 *   - A network failure yields a safe retryable message and releases the
 *     operation (Requirements 5.8, 7.7).
 *   - Accessible status regions (`role="status"` + `aria-live`) and field-error
 *     ARIA association (`aria-invalid` / `aria-describedby`) reach assistive
 *     technology (Requirements 9.3, 9.4).
 */

// --- Fixtures ---------------------------------------------------------------

const ACCESS_TOKEN = "scan-access-token-must-not-render"
const QUESTIONNAIRE_ID = "questionnaire-1"
const QR_TOKEN = "qr-token-1"
const UPLOAD_URL = "https://storage.test/objects/photo-123?sig=redacted"
const OBJECT_KEY = "responses/photo-123.png"
const LEAK_MARKER = "INTERNAL_LEAK_MUST_NOT_RENDER"

function makeVersion(): QuestionnaireVersionDTO {
  return {
    id: "version-1",
    questionnaireId: QUESTIONNAIRE_ID,
    versionNumber: 1,
    status: VERSION_STATUS.PUBLISHED,
    publishedAt: "2024-01-01T00:00:00.000Z",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  }
}

function makeQuestion(overrides: Partial<QuestionDTO> = {}): QuestionDTO {
  return {
    id: "question-1",
    order: 1,
    type: QUESTION_TYPE.SHORT_TEXT,
    prompt: "Pregunta",
    required: true,
    config: {},
    ...overrides,
  }
}

function makeResponse(overrides: Partial<ResponseDTO> = {}): ResponseDTO {
  return {
    id: "response-1",
    questionnaireId: QUESTIONNAIRE_ID,
    versionId: "version-1",
    businessDay: "2024-01-01",
    status: RESPONSE_STATUS.EDITABLE,
    answers: [],
    createdAt: "2024-01-01T00:00:00.000Z",
    submittedAt: null,
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function makeScan(overrides: Partial<ScanResolutionDTO> = {}): ScanResolutionDTO {
  return {
    questionnaireId: QUESTIONNAIRE_ID,
    version: makeVersion(),
    questions: [makeQuestion()],
    status: RESPONSE_STATUS.ABSENT,
    response: null,
    ...overrides,
  }
}

// --- fetch routing mock -----------------------------------------------------

interface FetchRoute {
  readonly method: string
  /** Substring matched against the request URL. */
  readonly match: string
  readonly handle: (init?: RequestInit) => Response | Promise<Response>
}

type FetchMock = ReturnType<typeof installFetch>

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
        if (route.method === method && url.includes(route.match)) {
          return route.handle(init)
        }
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`)
    }
  )

  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function methodCount(
  fetchMock: FetchMock,
  method: string,
  match: string
): number {
  return fetchMock.mock.calls.filter(
    ([input, init]) =>
      (init?.method ?? "GET").toUpperCase() === method &&
      String(input).includes(match)
  ).length
}

function findCall(fetchMock: FetchMock, method: string, match: string) {
  return fetchMock.mock.calls.find(
    ([input, init]) =>
      (init?.method ?? "GET").toUpperCase() === method &&
      String(input).includes(match)
  )
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
  children,
}: {
  children: ReactNode
}) {
  const { setAccess } = useAccess()

  useEffect(() => {
    const access: AccessContext = {
      accessToken: ACCESS_TOKEN,
      principalId: "principal-must-not-render",
      role: ROLE.EMPLEADO,
      availability: ACCESS_AVAILABILITY.AVAILABLE,
    }
    setAccess(access)
  }, [setAccess])

  return children
}

/** Renders the full resolver island with an available employee access context. */
function renderResolver(qrToken: string = QR_TOKEN) {
  return render(
    <AccessProvider>
      <AccessState>
        <ScanResolver qrToken={qrToken} />
      </AccessState>
    </AccessProvider>
  )
}

/** Renders the response form directly (no resolution round-trip). */
function renderForm(props: {
  questions: readonly QuestionDTO[]
  status: ResponseStatus
  response?: ResponseDTO | null
  onRescan?: () => void
}) {
  return render(
    <DynamicResponseForm
      accessToken={ACCESS_TOKEN}
      onRescan={props.onRescan ?? vi.fn()}
      questionnaireId={QUESTIONNAIRE_ID}
      questions={props.questions}
      response={props.response ?? null}
      status={props.status}
    />
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// --- Eleven question types (Requirements 5.1, 5.2) --------------------------

interface ControlCase {
  readonly name: string
  readonly question: QuestionDTO
  readonly assert: () => void
}

const CHOICE_OPTIONS = [
  { id: "a", label: "Opción A" },
  { id: "b", label: "Opción B" },
]

const CONTROL_CASES: readonly ControlCase[] = [
  {
    name: "boolean",
    question: makeQuestion({ id: "q-bool", type: QUESTION_TYPE.BOOLEAN }),
    assert: () => {
      const control = screen.getByRole("checkbox")
      expect(control).toBeEnabled()
      expect(control).toHaveAttribute("aria-required", "true")
    },
  },
  {
    name: "single_choice",
    question: makeQuestion({
      id: "q-single",
      type: QUESTION_TYPE.SINGLE_CHOICE,
      config: { options: CHOICE_OPTIONS },
    }),
    assert: () => {
      expect(screen.getByRole("radiogroup")).toBeInTheDocument()
      expect(screen.getAllByRole("radio")).toHaveLength(2)
      expect(screen.getByRole("radio", { name: "Opción A" })).toBeEnabled()
    },
  },
  {
    name: "multiple_choice",
    question: makeQuestion({
      id: "q-multi",
      type: QUESTION_TYPE.MULTIPLE_CHOICE,
      config: { options: CHOICE_OPTIONS },
    }),
    assert: () => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(2)
      expect(screen.getByRole("checkbox", { name: "Opción B" })).toBeEnabled()
    },
  },
  {
    name: "scale",
    question: makeQuestion({
      id: "q-scale",
      type: QUESTION_TYPE.SCALE,
      config: { min: 1, max: 5, step: 1 },
    }),
    assert: () => {
      const control = screen.getByRole("spinbutton")
      expect(control).toHaveAttribute("min", "1")
      expect(control).toHaveAttribute("max", "5")
      expect(control).toHaveAttribute("step", "1")
      expect(control).toHaveAttribute("aria-required", "true")
    },
  },
  {
    name: "number",
    question: makeQuestion({
      id: "q-number",
      type: QUESTION_TYPE.NUMBER,
      config: { min: 0, max: 10 },
    }),
    assert: () => {
      const control = screen.getByRole("spinbutton")
      expect(control).toHaveAttribute("min", "0")
      expect(control).toHaveAttribute("max", "10")
    },
  },
  {
    name: "short_text",
    question: makeQuestion({
      id: "q-short",
      type: QUESTION_TYPE.SHORT_TEXT,
      config: { maxLength: 120 },
    }),
    assert: () => {
      expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "120")
    },
  },
  {
    name: "long_text",
    question: makeQuestion({
      id: "q-long",
      type: QUESTION_TYPE.LONG_TEXT,
      config: { maxLength: 600 },
    }),
    assert: () => {
      const control = screen.getByRole("textbox")
      expect(control.tagName).toBe("TEXTAREA")
      expect(control).toHaveAttribute("maxlength", "600")
    },
  },
  {
    name: "date",
    question: makeQuestion({ id: "q-date", type: QUESTION_TYPE.DATE, prompt: "Fecha" }),
    assert: () => {
      expect(screen.getByLabelText(/Fecha/)).toHaveAttribute("type", "date")
    },
  },
  {
    name: "time",
    question: makeQuestion({ id: "q-time", type: QUESTION_TYPE.TIME, prompt: "Hora" }),
    assert: () => {
      expect(screen.getByLabelText(/Hora/)).toHaveAttribute("type", "time")
    },
  },
  {
    name: "photo",
    question: makeQuestion({ id: "q-photo", type: QUESTION_TYPE.PHOTO, prompt: "Foto" }),
    assert: () => {
      const control = document.querySelector('input[type="file"]')
      expect(control).not.toBeNull()
      expect(control).toHaveAttribute("aria-required", "true")
    },
  },
  {
    name: "file",
    question: makeQuestion({ id: "q-file", type: QUESTION_TYPE.FILE, prompt: "Documento" }),
    assert: () => {
      expect(document.querySelector('input[type="file"]')).not.toBeNull()
    },
  },
]

describe("scan controls — los 11 tipos de pregunta", () => {
  it.each(CONTROL_CASES)(
    "renderiza el control $name respetando configuración y obligatoriedad",
    ({ question, assert }) => {
      renderForm({ questions: [question], status: RESPONSE_STATUS.ABSENT })

      // The mandatory character of the question is surfaced.
      expect(screen.getByText(/obligatoria/)).toBeInTheDocument()
      assert()
    }
  )
})

// --- absent / editable / read_only states -----------------------------------

describe("scan states — absent/editable/read_only", () => {
  it("absent habilita la creación con un estado accesible", () => {
    renderForm({
      questions: [makeQuestion({ type: QUESTION_TYPE.SHORT_TEXT, prompt: "Nota" })],
      status: RESPONSE_STATUS.ABSENT,
    })

    const status = screen.getByText("Aún no has registrado la respuesta de hoy.")
    expect(status).toHaveAttribute("role", "status")
    expect(status).toHaveAttribute("aria-live", "polite")
    expect(
      screen.getByRole("button", { name: "Registrar respuesta" })
    ).toBeEnabled()
  })

  it("editable presenta la respuesta existente y habilita la actualización", () => {
    renderForm({
      questions: [makeQuestion({ type: QUESTION_TYPE.SHORT_TEXT, prompt: "Nota" })],
      status: RESPONSE_STATUS.EDITABLE,
      response: makeResponse({
        status: RESPONSE_STATUS.EDITABLE,
        answers: [{ questionId: "question-1", value: "Valor previo" }],
      }),
    })

    expect(screen.getByRole("textbox")).toHaveValue("Valor previo")
    expect(
      screen.getByRole("button", { name: "Guardar cambios" })
    ).toBeEnabled()
  })

  it("read_only inhabilita controles y submit, y desactiva la carga (sin presign)", () => {
    renderForm({
      questions: [
        makeQuestion({ id: "question-1", type: QUESTION_TYPE.SHORT_TEXT, prompt: "Nota" }),
        makeQuestion({ id: "q-photo", type: QUESTION_TYPE.PHOTO, prompt: "Foto" }),
      ],
      status: RESPONSE_STATUS.READ_ONLY,
      response: makeResponse({
        status: RESPONSE_STATUS.READ_ONLY,
        answers: [
          { questionId: "question-1", value: "Valor" },
          { questionId: "q-photo", value: OBJECT_KEY },
        ],
      }),
    })

    const status = screen.getByText("Tu respuesta de hoy ya no puede modificarse.")
    expect(status).toHaveAttribute("role", "status")

    // No submit control is offered for a read_only scan.
    expect(
      screen.queryByRole("button", { name: "Registrar respuesta" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Guardar cambios" })
    ).not.toBeInTheDocument()

    // Every input is inert.
    expect(screen.getByRole("textbox")).toBeDisabled()

    // Uploads are inactive: no file input exists, so no presign/PUT can fire.
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByText("Archivo cargado.")).toBeInTheDocument()
  })
})

// --- photo/file upload flow (Requirement 5.6) -------------------------------

describe("scan upload — presign → PUT sin Bearer → objectKey", () => {
  it("presigna con Authorization, sube por PUT sin token y guarda sólo el objectKey", async () => {
    const fetchMock = installFetch([
      {
        method: "POST",
        match: "/uploads/presign",
        handle: () =>
          jsonResponse(200, { uploadUrl: UPLOAD_URL, objectKey: OBJECT_KEY }),
      },
      {
        method: "PUT",
        match: "storage.test",
        handle: () => new Response(null, { status: 200 }),
      },
      {
        method: "POST",
        match: "/responses",
        handle: () =>
          jsonResponse(201, {
            response: makeResponse({
              status: RESPONSE_STATUS.EDITABLE,
              answers: [{ questionId: "q-photo", value: OBJECT_KEY }],
            }),
          }),
      },
    ])

    const onRescan = vi.fn()
    renderForm({
      questions: [
        makeQuestion({
          id: "q-photo",
          type: QUESTION_TYPE.PHOTO,
          prompt: "Foto",
          required: false,
        }),
      ],
      status: RESPONSE_STATUS.ABSENT,
      onRescan,
    })

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    const file = new File(["bytes"], "foto.png", { type: "image/png" })
    await userEvent.upload(fileInput, file)

    // The stored object is reflected in the UI.
    await screen.findByText("Archivo cargado.")

    // The presign call is a protected /api/v1 request carrying the token.
    const presignCall = findCall(fetchMock, "POST", "/uploads/presign")
    expect(presignCall).toBeDefined()
    expect(new Headers(presignCall?.[1]?.headers).get("Authorization")).toBe(
      `Bearer ${ACCESS_TOKEN}`
    )

    // The pre-signed PUT targets the returned URL WITHOUT any Authorization.
    const putCall = findCall(fetchMock, "PUT", "storage.test")
    expect(putCall).toBeDefined()
    expect(String(putCall?.[0])).toBe(UPLOAD_URL)
    expect(new Headers(putCall?.[1]?.headers).has("Authorization")).toBe(false)
    expect(new Headers(putCall?.[1]?.headers).get("Content-Type")).toBe(
      "image/png"
    )

    // Submitting sends ONLY the server object key as the answer value.
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" })
    )
    await waitFor(() => expect(onRescan).toHaveBeenCalledTimes(1))

    const responseCall = findCall(fetchMock, "POST", "/responses")
    const rawBody = String(responseCall?.[1]?.body)
    const body = JSON.parse(rawBody) as {
      questionnaireId: string
      answers: unknown[]
    }
    expect(body.questionnaireId).toBe(QUESTIONNAIRE_ID)
    expect(body.answers).toContainEqual({
      questionId: "q-photo",
      type: "photo",
      value: OBJECT_KEY,
    })
    // The pre-signed URL never leaks into the answer payload.
    expect(rawBody).not.toContain(UPLOAD_URL)
  })
})

// --- HTTP 409 re-resolves the QR link (Requirements 5.7, 7.5) ---------------

describe("scan conflicto — HTTP 409 reescanea", () => {
  it("re-resuelve el QR y habilita sólo la acción del nuevo estado", async () => {
    let scanCalls = 0
    const fetchMock = installFetch([
      {
        method: "GET",
        match: "/scan/",
        handle: () => {
          scanCalls += 1
          const firstResolution = scanCalls === 1
          return jsonResponse(200, {
            scan: makeScan({
              questions: [
                makeQuestion({ type: QUESTION_TYPE.SHORT_TEXT, prompt: "Nota" }),
              ],
              status: firstResolution
                ? RESPONSE_STATUS.ABSENT
                : RESPONSE_STATUS.READ_ONLY,
              response: firstResolution
                ? null
                : makeResponse({
                    status: RESPONSE_STATUS.READ_ONLY,
                    answers: [{ questionId: "question-1", value: "ya" }],
                  }),
            }),
          })
        },
      },
      {
        method: "POST",
        match: "/responses",
        handle: () => jsonResponse(409, { message: LEAK_MARKER }),
      },
    ])

    renderResolver()

    await userEvent.click(
      await screen.findByRole("button", { name: "Registrar respuesta" })
    )

    // After the conflict the QR link is re-resolved and the surface reflects
    // the freshly reported read_only status: no mutation control remains.
    await screen.findByText("Tu respuesta de hoy ya no puede modificarse.")
    expect(
      screen.queryByRole("button", { name: "Registrar respuesta" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Guardar cambios" })
    ).not.toBeInTheDocument()

    await waitFor(() =>
      expect(methodCount(fetchMock, "GET", "/scan/")).toBe(2)
    )
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- HTTP 422 (Requirements 5.8, 7.6, 7.8) ----------------------------------

describe("scan validación — HTTP 422", () => {
  it("muestra un único mensaje general seguro y conserva los datos", async () => {
    installFetch([
      {
        method: "POST",
        match: "/responses",
        handle: () =>
          jsonResponse(422, {
            issues: [{ path: ["answers"], message: LEAK_MARKER }],
          }),
      },
    ])

    const onRescan = vi.fn()
    renderForm({
      questions: [makeQuestion({ type: QUESTION_TYPE.SHORT_TEXT, prompt: "Nota" })],
      status: RESPONSE_STATUS.ABSENT,
      onRescan,
    })

    await userEvent.type(screen.getByRole("textbox"), "Hola")
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" })
    )

    const general = await screen.findByText(
      "Revisá los campos marcados e intentá nuevamente."
    )
    expect(general).toHaveAttribute("role", "status")
    expect(general).toHaveAttribute("aria-live", "polite")

    // Non-sensitive data is preserved and the operation is released.
    expect(screen.getByRole("textbox")).toHaveValue("Hola")
    expect(
      screen.getByRole("button", { name: "Registrar respuesta" })
    ).toBeEnabled()
    // A 422 does not re-resolve the scan.
    expect(onRescan).not.toHaveBeenCalled()
    expect(document.body).not.toHaveTextContent(LEAK_MARKER)
  })
})

// --- Network failure (Requirements 5.8, 7.7) --------------------------------

describe("scan red — falla reintentable", () => {
  it("presenta un mensaje seguro reintentable y libera la operación", async () => {
    installFetch([
      {
        method: "POST",
        match: "/responses",
        handle: () => {
          throw new Error("network down")
        },
      },
    ])

    const onRescan = vi.fn()
    renderForm({
      questions: [makeQuestion({ type: QUESTION_TYPE.SHORT_TEXT, prompt: "Nota" })],
      status: RESPONSE_STATUS.ABSENT,
      onRescan,
    })

    await userEvent.type(screen.getByRole("textbox"), "Hola")
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" })
    )

    const message = await screen.findByText(
      "No se pudo completar la operación. Intentá nuevamente."
    )
    expect(message).toHaveAttribute("role", "status")

    expect(screen.getByRole("textbox")).toHaveValue("Hola")
    expect(
      screen.getByRole("button", { name: "Registrar respuesta" })
    ).toBeEnabled()
    expect(onRescan).not.toHaveBeenCalled()
  })
})

// --- Single pending submission (Requirement 7.1) ----------------------------

describe("scan envío — una sola solicitud pendiente", () => {
  it("inhabilita nuevas activaciones mientras la operación está pendiente", async () => {
    const gate = deferred<void>()
    const fetchMock = installFetch([
      {
        method: "POST",
        match: "/responses",
        handle: async () => {
          await gate.promise
          return jsonResponse(201, { response: makeResponse() })
        },
      },
    ])

    const onRescan = vi.fn()
    renderForm({
      questions: [makeQuestion({ type: QUESTION_TYPE.SHORT_TEXT, prompt: "Nota" })],
      status: RESPONSE_STATUS.ABSENT,
      onRescan,
    })

    await userEvent.type(screen.getByRole("textbox"), "Hola")
    await userEvent.click(
      screen.getByRole("button", { name: "Registrar respuesta" })
    )

    const pending = await screen.findByRole("button", { name: "Guardando…" })
    expect(pending).toBeDisabled()
    expect(methodCount(fetchMock, "POST", "/responses")).toBe(1)

    // A second activation while pending dispatches no additional request.
    fireEvent.click(pending)
    expect(methodCount(fetchMock, "POST", "/responses")).toBe(1)

    gate.resolve()
    await waitFor(() => expect(onRescan).toHaveBeenCalledTimes(1))
    expect(methodCount(fetchMock, "POST", "/responses")).toBe(1)
  })
})

// --- Resolution error + retry (Requirements 5.8, 7.7) -----------------------

describe("scan resolución — error reintentable", () => {
  it("muestra un mensaje seguro y reintenta la resolución del QR", async () => {
    let scanCalls = 0
    const fetchMock = installFetch([
      {
        method: "GET",
        match: "/scan/",
        handle: () => {
          scanCalls += 1
          return scanCalls === 1
            ? new Response(null, { status: 500 })
            : jsonResponse(200, { scan: makeScan() })
        },
      },
    ])

    renderResolver()

    const message = await screen.findByText(
      "No se pudo completar la operación. Intentá nuevamente."
    )
    expect(message).toHaveAttribute("role", "status")

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }))

    // The retry re-resolves and renders the form.
    await screen.findByRole("button", { name: "Registrar respuesta" })
    await waitFor(() =>
      expect(methodCount(fetchMock, "GET", "/scan/")).toBe(2)
    )
  })
})

// --- Field-error ARIA association (Requirements 9.3, 5.8) -------------------

describe("scan accesibilidad — asociación ARIA del error de campo", () => {
  it("asocia el error de un control de campo mediante aria-invalid y aria-describedby", () => {
    render(
      <QuestionControl
        accessToken={ACCESS_TOKEN}
        disabled={false}
        fieldError="Revisá este campo."
        onChange={vi.fn()}
        question={makeQuestion({
          id: "q-note",
          type: QUESTION_TYPE.SHORT_TEXT,
          prompt: "Nota",
        })}
        questionnaireId={QUESTIONNAIRE_ID}
        uploadActive
        value=""
      />
    )

    const input = screen.getByLabelText(/Nota/)
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", "answer-q-note-error")
    expect(input).toHaveAccessibleDescription("Revisá este campo.")

    const alert = screen.getByText("Revisá este campo.")
    expect(alert).toHaveAttribute("id", "answer-q-note-error")
    expect(alert).toHaveAttribute("aria-live", "assertive")
  })

  it("asocia el error de un grupo de opciones con el fieldset", () => {
    render(
      <QuestionControl
        accessToken={ACCESS_TOKEN}
        disabled={false}
        fieldError="Revisá este campo."
        onChange={vi.fn()}
        question={makeQuestion({
          id: "q-single",
          type: QUESTION_TYPE.SINGLE_CHOICE,
          prompt: "Elección",
          config: { options: CHOICE_OPTIONS },
        })}
        questionnaireId={QUESTIONNAIRE_ID}
        uploadActive
        value=""
      />
    )

    const group = screen.getByRole("group")
    expect(group).toHaveAttribute("aria-invalid", "true")
    expect(group).toHaveAttribute("aria-describedby", "answer-q-single-error")
  })
})
