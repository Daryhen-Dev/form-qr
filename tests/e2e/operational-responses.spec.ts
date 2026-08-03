import { expect, test, type Page, type Route } from "@playwright/test"

/**
 * Integrated employee daily-response coverage over the existing `/api/v1`
 * contracts for the `/scan/[qrToken]` surface (`ScanResolver`).
 *
 * Because the in-memory access context only exists after a login within the
 * same document, each scenario authenticates directly on the target scan route
 * (following operational-access/operational-admin): the login surface is
 * presented first, and a successful Empleado login lets the resolver render the
 * scan surface without a full reload.
 *
 * Covers:
 *   - Resolve a QR link and present the ordered questions plus the reported
 *     status (Requirements 5.1, 5.2).
 *   - Create a Respuesta_Diaria from an `absent` scan and, after re-resolution,
 *     edit it from an `editable` scan (Requirements 5.3, 5.4).
 *   - HTTP 409 on create re-resolves the QR link and enables ONLY the action
 *     allowed by the freshly reported status (Requirements 5.7, 7.5).
 *   - The `photo`/`file` upload flow: presign (protected) → PUT to the returned
 *     URL WITHOUT Authorization → only the server `objectKey` is stored and sent
 *     as the answer value; the pre-signed URL never leaks into the response body
 *     (Requirement 5.6).
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

const LOGIN = {
  CEDULA: "123456",
  PASSWORD: "current-password",
} as const

const QR_TOKEN = "qr-token-1"
const QUESTIONNAIRE_ID = "questionnaire-1"
const UPLOAD_URL = "https://storage.test/objects/photo-123?sig=redacted"
const OBJECT_KEY = "responses/photo-123.png"
const TIMESTAMP = "2024-01-01T00:00:00.000Z"

type ResponseStatus = "absent" | "editable" | "read_only"

interface QuestionRecord {
  id: string
  order: number
  type: string
  prompt: string
  required: boolean
  config: Record<string, unknown>
}

interface AnswerRecord {
  questionId: string
  value: unknown
}

interface ResponseRecord {
  id: string
  questionnaireId: string
  versionId: string
  businessDay: string
  status: ResponseStatus
  answers: AnswerRecord[]
  createdAt: string
  submittedAt: string | null
  updatedAt: string
}

interface ScanRecord {
  questionnaireId: string
  version: Record<string, unknown>
  questions: QuestionRecord[]
  status: ResponseStatus
  response: ResponseRecord | null
}

function versionRecord(): Record<string, unknown> {
  return {
    id: "version-1",
    questionnaireId: QUESTIONNAIRE_ID,
    versionNumber: 1,
    status: "published",
    publishedAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  }
}

function questionRecord(over: Partial<QuestionRecord> & { id: string }): QuestionRecord {
  return {
    order: 1,
    type: "short_text",
    prompt: "Nota",
    required: true,
    config: {},
    ...over,
  }
}

function responseRecord(
  over: Partial<ResponseRecord> & { id: string }
): ResponseRecord {
  return {
    questionnaireId: QUESTIONNAIRE_ID,
    versionId: "version-1",
    businessDay: "2024-01-01",
    status: "editable",
    answers: [],
    createdAt: TIMESTAMP,
    submittedAt: null,
    updatedAt: TIMESTAMP,
    ...over,
  }
}

function scanRecord(over: Partial<ScanRecord> = {}): ScanRecord {
  return {
    questionnaireId: QUESTIONNAIRE_ID,
    version: versionRecord(),
    questions: [questionRecord({ id: "question-1" })],
    status: "absent",
    response: null,
    ...over,
  }
}

function loginPayload() {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    user: { id: "user-emp", role: "Empleado" },
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

function jsonBody(route: Route): Record<string, unknown> {
  const raw = route.request().postData()
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
}

async function fulfillJson(route: Route, status: number, payload?: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: payload === undefined ? "{}" : JSON.stringify(payload),
  })
}

async function stubAuth(page: Page) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await fulfillJson(route, 200, loginPayload())
  })
}

/**
 * Authenticate on the currently loaded scan route so the resolver can render
 * the scan surface in the same document (in-memory access is preserved).
 */
async function loginOnScanRoute(page: Page) {
  await stubAuth(page)

  const login = getLoginControls(page)
  await expect(login.heading).toBeVisible()
  await login.cedula.fill(LOGIN.CEDULA)
  await login.password.fill(LOGIN.PASSWORD)
  await login.submit.click()
}

test.describe("Operational daily responses", () => {
  test("resolves a QR link and presents the ordered questions and status", async ({
    page,
  }) => {
    await page.route("**/api/v1/scan/*", async (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, 200, {
          scan: scanRecord({
            questions: [
              questionRecord({ id: "question-1", prompt: "Nota diaria" }),
            ],
            status: "absent",
          }),
        })
      }
      return route.fallback()
    })

    await page.goto(`/scan/${QR_TOKEN}`)
    await loginOnScanRoute(page)

    await expect(
      page.getByRole("heading", { name: "Cuestionario diario", exact: true })
    ).toBeVisible()
    await expect(
      page.getByText("Aún no has registrado la respuesta de hoy.", { exact: true })
    ).toBeVisible()
    await expect(page.getByLabel(/Nota diaria/)).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Registrar respuesta", exact: true })
    ).toBeEnabled()
  })

  test("creates a response from absent and then edits it from editable", async ({
    page,
  }) => {
    // Stateful scan: absent first, then editable once a response exists.
    const stored: ResponseRecord = responseRecord({
      id: "response-1",
      status: "editable",
      answers: [{ questionId: "question-1", value: "Primer valor" }],
    })
    let responseCreated = false
    let createBody: Record<string, unknown> | undefined
    let patchBody: Record<string, unknown> | undefined

    await page.route("**/api/v1/scan/*", async (route) => {
      if (route.request().method() !== "GET") {
        return route.fallback()
      }
      return fulfillJson(route, 200, {
        scan: responseCreated
          ? scanRecord({ status: "editable", response: stored })
          : scanRecord({ status: "absent", response: null }),
      })
    })

    await page.route("**/api/v1/responses", async (route) => {
      if (route.request().method() === "POST") {
        createBody = jsonBody(route)
        responseCreated = true
        return fulfillJson(route, 201, { response: stored })
      }
      return route.fallback()
    })

    await page.route("**/api/v1/responses/*", async (route) => {
      if (route.request().method() === "PATCH") {
        patchBody = jsonBody(route)
        // Persist the edit so the subsequent re-resolution reflects it.
        stored.answers = [{ questionId: "question-1", value: "Valor editado" }]
        return fulfillJson(route, 200, { response: responseRecord({ ...stored }) })
      }
      return route.fallback()
    })

    await page.goto(`/scan/${QR_TOKEN}`)
    await loginOnScanRoute(page)

    // --- CREATE from an absent scan ---
    const noteInput = page.getByLabel(/Nota/)
    await expect(noteInput).toBeVisible()
    await noteInput.fill("Primer valor")
    await page
      .getByRole("button", { name: "Registrar respuesta", exact: true })
      .click()

    // After success the QR link is re-resolved and the surface now reflects the
    // editable status returned by the server.
    await expect(
      page.getByText("Puedes editar tu respuesta de hoy.", { exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Guardar cambios", exact: true })
    ).toBeEnabled()
    expect(createBody?.questionnaireId).toBe(QUESTIONNAIRE_ID)
    expect(createBody?.answers).toContainEqual({
      questionId: "question-1",
      type: "short_text",
      value: "Primer valor",
    })

    // The editable scan seeds the existing answer value.
    await expect(page.getByLabel(/Nota/)).toHaveValue("Primer valor")

    // --- EDIT from the editable scan ---
    await page.getByLabel(/Nota/).fill("Valor editado")
    await page
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click()

    // After a successful update the QR link is re-resolved and the surface
    // reflects the persisted edit.
    await expect(page.getByLabel(/Nota/)).toHaveValue("Valor editado")
    await expect(
      page.getByRole("button", { name: "Guardar cambios", exact: true })
    ).toBeEnabled()
    expect(patchBody?.answers).toContainEqual({
      questionId: "question-1",
      type: "short_text",
      value: "Valor editado",
    })
  })

  test("HTTP 409 on create re-resolves the QR and enables only the new state's action", async ({
    page,
  }) => {
    let scanCalls = 0

    await page.route("**/api/v1/scan/*", async (route) => {
      if (route.request().method() !== "GET") {
        return route.fallback()
      }
      scanCalls += 1
      const firstResolution = scanCalls === 1
      return fulfillJson(route, 200, {
        scan: scanRecord({
          status: firstResolution ? "absent" : "read_only",
          response: firstResolution
            ? null
            : responseRecord({
                id: "response-1",
                status: "read_only",
                answers: [{ questionId: "question-1", value: "ya" }],
              }),
        }),
      })
    })

    await page.route("**/api/v1/responses", async (route) => {
      if (route.request().method() === "POST") {
        // A conflicting concurrent change already registered today's response.
        return fulfillJson(route, 409, { message: "conflict-detail" })
      }
      return route.fallback()
    })

    await page.goto(`/scan/${QR_TOKEN}`)
    await loginOnScanRoute(page)

    await page
      .getByRole("button", { name: "Registrar respuesta", exact: true })
      .click()

    // After the conflict the QR link is re-resolved; the surface reflects the
    // freshly reported read_only status, so no mutation control remains.
    await expect(
      page.getByText("Tu respuesta de hoy ya no puede modificarse.", {
        exact: true,
      })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Registrar respuesta", exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Guardar cambios", exact: true })
    ).toHaveCount(0)

    await expect.poll(() => scanCalls).toBe(2)
    await expect(page.locator("body")).not.toContainText("conflict-detail")
  })

  test("uploads a photo via presign → PUT without Authorization → stores only the objectKey", async ({
    page,
  }) => {
    let presignAuth: string | null = null
    let putAuthorizationPresent = true
    let putUrl: string | undefined
    let putContentType: string | null = null
    let responseBodyRaw: string | undefined

    await page.route("**/api/v1/scan/*", async (route) => {
      if (route.request().method() !== "GET") {
        return route.fallback()
      }
      return fulfillJson(route, 200, {
        scan: scanRecord({
          questions: [
            questionRecord({
              id: "q-photo",
              type: "photo",
              prompt: "Foto",
              required: false,
            }),
          ],
          status: "absent",
          response: null,
        }),
      })
    })

    await page.route("**/api/v1/uploads/presign", async (route) => {
      if (route.request().method() === "POST") {
        presignAuth = route.request().headers()["authorization"] ?? null
        return fulfillJson(route, 200, {
          uploadUrl: UPLOAD_URL,
          objectKey: OBJECT_KEY,
        })
      }
      return route.fallback()
    })

    // External pre-signed PUT: object storage, NOT a protected /api/v1 call.
    await page.route("https://storage.test/**", async (route) => {
      if (route.request().method() === "PUT") {
        const headers = route.request().headers()
        putAuthorizationPresent = "authorization" in headers
        putUrl = route.request().url()
        putContentType = headers["content-type"] ?? null
        return route.fulfill({ status: 200 })
      }
      return route.fallback()
    })

    await page.route("**/api/v1/responses", async (route) => {
      if (route.request().method() === "POST") {
        responseBodyRaw = route.request().postData() ?? undefined
        return fulfillJson(route, 201, {
          response: responseRecord({
            id: "response-1",
            status: "editable",
            answers: [{ questionId: "q-photo", value: OBJECT_KEY }],
          }),
        })
      }
      return route.fallback()
    })

    await page.goto(`/scan/${QR_TOKEN}`)
    await loginOnScanRoute(page)

    const fileInput = page.locator('input[type="file"]')
    await expect(fileInput).toBeVisible()
    await fileInput.setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: Buffer.from("bytes"),
    })

    // The stored object is reflected in the UI once the upload completes.
    await expect(page.getByText("Archivo cargado.", { exact: true })).toBeVisible()

    // The presign request is a protected /api/v1 call carrying the token.
    expect(presignAuth).toBe("Bearer test-access-token")

    // The pre-signed PUT targets the returned URL WITHOUT any Authorization.
    expect(putUrl).toBe(UPLOAD_URL)
    expect(putAuthorizationPresent).toBe(false)
    expect(putContentType).toBe("image/png")

    // Submitting sends ONLY the server object key as the answer value.
    await page
      .getByRole("button", { name: "Registrar respuesta", exact: true })
      .click()
    await expect.poll(() => responseBodyRaw).toBeDefined()

    expect(responseBodyRaw).toBeDefined()
    const body = JSON.parse(String(responseBodyRaw)) as {
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
    expect(String(responseBodyRaw)).not.toContain(UPLOAD_URL)
  })
})
