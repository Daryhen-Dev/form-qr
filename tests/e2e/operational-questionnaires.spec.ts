import { expect, test, type Page, type Route } from "@playwright/test"

/**
 * Integrated questionnaire lifecycle coverage over the existing
 * `/api/v1/questionnaires` contracts: questionnaire → version → publish →
 * assign → QR.
 *
 * Because the in-memory access context only exists after a login within the
 * same document, the scenario authenticates directly on the protected
 * `/operaciones/cuestionarios` route (following operational-access /
 * operational-navigation / operational-admin): the login surface is presented
 * first, and a successful login lets the route gate render the role-scoped
 * questionnaires shell without a full reload.
 *
 * The whole lifecycle is composed inline on the single authorized surface:
 *   - Create a questionnaire (`POST /questionnaires`) and manage it.
 *   - Create a draft version (`POST .../versions`), save the ordered question
 *     set (`PATCH .../versions/:versionId`).
 *   - Publish (`POST .../versions/:versionId/publish`): the displayed status is
 *     driven EXCLUSIVELY by the API result, never optimistically.
 *   - Assign a branch (`GET`/`POST .../branches`) and fetch the QR
 *     (`GET .../qr`).
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

const LOGIN = {
  CEDULA: "123456",
  PASSWORD: "current-password",
} as const

const TIMESTAMP = "2024-01-01T00:00:00.000Z"
const PUBLISHED_AT = "2024-02-01T00:00:00.000Z"

const QUESTIONNAIRE_TITLE = "Cuestionario diario"
const BRANCH_NAME = "Sucursal Centro"

// --- DTO records backing the stateful mock ----------------------------------

interface QuestionnaireRecord {
  id: string
  title: string
  description: string | null
  currentVersionId: string | null
  createdAt: string
  updatedAt: string
}

interface VersionRecord {
  id: string
  questionnaireId: string
  versionNumber: number
  status: "draft" | "published"
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

interface QuestionRecord {
  id: string
  order: number
  type: string
  prompt: string
  required: boolean
  config: Record<string, unknown>
}

interface AssignmentRecord {
  id: string
  questionnaireId: string
  branchId: string
  assignedAt: string
}

function loginPayload(role: string) {
  return {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    user: { id: "user-admin", role },
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

async function fulfillJson(route: Route, status: number, payload: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  })
}

async function stubAuth(page: Page, role: string) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await fulfillJson(route, 200, loginPayload(role))
  })
}

/**
 * Installs a stateful mock for the questionnaire contracts plus the branch
 * catalogue consumed by the assignment panel. State lives entirely in memory so
 * every step observes the effect of the previous request (list-after-write,
 * publish-reflects-result).
 */
async function stubQuestionnaireApi(page: Page) {
  const questionnaires: QuestionnaireRecord[] = []
  const versionsByQuestionnaire = new Map<string, VersionRecord[]>()
  const questionsByVersion = new Map<string, QuestionRecord[]>()
  const assignmentsByQuestionnaire = new Map<string, AssignmentRecord[]>()
  const branches = [
    {
      id: "branch-1",
      name: BRANCH_NAME,
      code: "C-01",
      address: null,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  ]

  let questionnaireSeq = 0
  let versionSeq = 0
  let questionSeq = 0
  let assignmentSeq = 0

  // The branch catalogue for the assignment selector. The bare `/branches`
  // route never matches `/questionnaires/:id/branches` (different suffix).
  await page.route("**/api/v1/branches", async (route) => {
    if (route.request().method() === "GET") {
      return fulfillJson(route, 200, { branches })
    }
    return route.fallback()
  })

  await page.route("**/api/v1/questionnaires**", async (route) => {
    const method = route.request().method()
    const { pathname } = new URL(route.request().url())
    const segments = pathname.split("/").filter(Boolean)
    // Segments after ".../questionnaires".
    const index = segments.indexOf("questionnaires")
    const rest = segments.slice(index + 1).map(decodeURIComponent)

    // --- /questionnaires (collection) ---
    if (rest.length === 0) {
      if (method === "GET") {
        return fulfillJson(route, 200, { questionnaires })
      }
      if (method === "POST") {
        const body = jsonBody(route)
        const created: QuestionnaireRecord = {
          id: `q-${++questionnaireSeq}`,
          title: String(body.title),
          description:
            body.description === undefined ? null : String(body.description),
          currentVersionId: null,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        }
        questionnaires.push(created)
        return fulfillJson(route, 201, { questionnaire: created })
      }
      return route.fallback()
    }

    const questionnaireId = rest[0]

    // --- /questionnaires/:id/qr ---
    if (rest.length === 2 && rest[1] === "qr" && method === "GET") {
      return fulfillJson(route, 200, {
        qr: {
          qrToken: `token-${questionnaireId}`,
          scanUrl: `https://form-qr.example/scan/token-${questionnaireId}`,
          qrSvg: '<svg role="presentation"><rect width="10" height="10" /></svg>',
        },
      })
    }

    // --- /questionnaires/:id/versions (collection) ---
    if (rest.length === 2 && rest[1] === "versions") {
      const versions = versionsByQuestionnaire.get(questionnaireId) ?? []
      if (method === "GET") {
        return fulfillJson(route, 200, { versions })
      }
      if (method === "POST") {
        const created: VersionRecord = {
          id: `v-${++versionSeq}`,
          questionnaireId,
          versionNumber: versions.length + 1,
          status: "draft",
          publishedAt: null,
          createdAt: TIMESTAMP,
          updatedAt: TIMESTAMP,
        }
        versions.push(created)
        versionsByQuestionnaire.set(questionnaireId, versions)
        questionsByVersion.set(created.id, [])
        return fulfillJson(route, 201, { version: created })
      }
      return route.fallback()
    }

    // --- /questionnaires/:id/versions/:versionId ---
    if (rest.length === 3 && rest[1] === "versions") {
      const versionId = rest[2]
      const versions = versionsByQuestionnaire.get(questionnaireId) ?? []
      const version = versions.find((item) => item.id === versionId)
      const questions = questionsByVersion.get(versionId) ?? []

      if (method === "GET" && version) {
        return fulfillJson(route, 200, { version: { ...version, questions } })
      }
      if (method === "PATCH" && version) {
        const body = jsonBody(route)
        const incoming = Array.isArray(body.questions)
          ? (body.questions as Array<Record<string, unknown>>)
          : []
        const persisted: QuestionRecord[] = incoming.map((question) => ({
          id: `question-${++questionSeq}`,
          order: Number(question.order),
          type: String(question.type),
          prompt: String(question.prompt),
          required: Boolean(question.required),
          config: (question.config as Record<string, unknown>) ?? {},
        }))
        questionsByVersion.set(versionId, persisted)
        return fulfillJson(route, 200, {
          version: { ...version, questions: persisted },
        })
      }
      return route.fallback()
    }

    // --- /questionnaires/:id/versions/:versionId/publish ---
    if (
      rest.length === 4 &&
      rest[1] === "versions" &&
      rest[3] === "publish" &&
      method === "POST"
    ) {
      const versionId = rest[2]
      const versions = versionsByQuestionnaire.get(questionnaireId) ?? []
      const version = versions.find((item) => item.id === versionId)
      if (version) {
        version.status = "published"
        version.publishedAt = PUBLISHED_AT
        const questionnaire = questionnaires.find(
          (item) => item.id === questionnaireId
        )
        if (questionnaire) {
          questionnaire.currentVersionId = version.id
        }
        return fulfillJson(route, 200, { version })
      }
      return route.fallback()
    }

    // --- /questionnaires/:id/branches (collection) ---
    if (rest.length === 2 && rest[1] === "branches") {
      const assignments = assignmentsByQuestionnaire.get(questionnaireId) ?? []
      if (method === "GET") {
        return fulfillJson(route, 200, { assignments })
      }
      if (method === "POST") {
        const body = jsonBody(route)
        const created: AssignmentRecord = {
          id: `assignment-${++assignmentSeq}`,
          questionnaireId,
          branchId: String(body.branchId),
          assignedAt: TIMESTAMP,
        }
        assignments.push(created)
        assignmentsByQuestionnaire.set(questionnaireId, assignments)
        return fulfillJson(route, 201, { assignment: created })
      }
      return route.fallback()
    }

    // --- /questionnaires/:id/branches/:branchId ---
    if (rest.length === 3 && rest[1] === "branches" && method === "DELETE") {
      const branchId = rest[2]
      const assignments = assignmentsByQuestionnaire.get(questionnaireId) ?? []
      assignmentsByQuestionnaire.set(
        questionnaireId,
        assignments.filter((item) => item.branchId !== branchId)
      )
      return fulfillJson(route, 200, { success: true })
    }

    // --- /questionnaires/:id ---
    if (rest.length === 1) {
      const questionnaire = questionnaires.find(
        (item) => item.id === questionnaireId
      )
      if (method === "GET" && questionnaire) {
        return fulfillJson(route, 200, { questionnaire })
      }
      if (method === "PATCH" && questionnaire) {
        const body = jsonBody(route)
        questionnaire.title = String(body.title ?? questionnaire.title)
        questionnaire.description =
          body.description === undefined
            ? questionnaire.description
            : String(body.description)
        return fulfillJson(route, 200, { questionnaire })
      }
      if (method === "DELETE" && questionnaire) {
        const position = questionnaires.indexOf(questionnaire)
        questionnaires.splice(position, 1)
        return fulfillJson(route, 200, { success: true })
      }
      return route.fallback()
    }

    return route.fallback()
  })
}

/**
 * Authenticate on the currently loaded protected route so the route gate can
 * render the role shell in the same document (in-memory access is preserved).
 */
async function loginOnCurrentRoute(page: Page, role: string) {
  await stubAuth(page, role)

  const login = getLoginControls(page)
  await expect(login.heading).toBeVisible()
  await login.cedula.fill(LOGIN.CEDULA)
  await login.password.fill(LOGIN.PASSWORD)
  await login.submit.click()
}

test.describe("Operational questionnaires", () => {
  test("runs the questionnaire → version → publish → assign → QR lifecycle", async ({
    page,
  }) => {
    await stubQuestionnaireApi(page)

    await page.goto("/operaciones/cuestionarios")
    await loginOnCurrentRoute(page, "Administrador")

    await expect(
      page.getByRole("heading", { name: "Cuestionarios", exact: true })
    ).toBeVisible()

    // --- Create a questionnaire (Requirement 4.1) ---
    await page
      .getByRole("button", { name: "Nuevo cuestionario", exact: true })
      .click()
    const createForm = page.getByRole("group", { name: "Crear cuestionario" })
    await createForm.getByLabel("Título", { exact: true }).fill(QUESTIONNAIRE_TITLE)
    await createForm
      .getByLabel("Descripción", { exact: true })
      .fill("Control de apertura")
    await createForm.getByRole("button", { name: "Guardar", exact: true }).click()

    // The created questionnaire is listed once the create call settles.
    const listItem = page
      .getByRole("listitem")
      .filter({ hasText: QUESTIONNAIRE_TITLE })
    await expect(listItem).toBeVisible()
    await expect(page.getByRole("group", { name: "Crear cuestionario" })).toHaveCount(
      0
    )

    // Open the management surface (versions + assignments + QR panels).
    await listItem.getByRole("button", { name: "Gestionar", exact: true }).click()

    const versionsPanel = page.getByRole("group", {
      name: "Versiones del cuestionario",
    })
    await expect(versionsPanel).toBeVisible()
    await expect(
      versionsPanel.getByText("No hay versiones. Cree una versión borrador.")
    ).toBeVisible()

    // --- Create a draft version (Requirement 4.2) ---
    await versionsPanel
      .getByRole("button", { name: "Nueva versión borrador", exact: true })
      .click()

    // Creating a version selects it and loads its (empty) question set.
    await expect(
      page.getByRole("heading", { level: 4, name: "Versión 1 · Borrador" })
    ).toBeVisible()

    // --- Save the ordered question set (Requirement 4.3) ---
    await versionsPanel
      .getByRole("button", { name: "Agregar pregunta", exact: true })
      .click()
    await versionsPanel
      .getByLabel("Enunciado", { exact: true })
      .fill("¿Todo en orden?")
    await versionsPanel
      .getByRole("button", { name: "Guardar preguntas", exact: true })
      .click()

    // The create-version and save-questions success regions share the same safe
    // text; the save region is rendered last, after the question builder.
    await expect(
      versionsPanel.getByText("Operación completada.", { exact: true }).last()
    ).toBeVisible()

    // --- Publish: displayed status comes ONLY from the API (Requirement 4.4) ---
    await versionsPanel
      .getByRole("button", { name: "Publicar versión", exact: true })
      .click()

    await expect(
      page.getByRole("heading", { level: 4, name: "Versión 1 · Publicada" })
    ).toBeVisible()
    await expect(
      versionsPanel.getByText(
        "Esta versión está publicada y no puede modificarse.",
        { exact: true }
      )
    ).toBeVisible()
    // A published version withdraws the draft-only publish control.
    await expect(
      versionsPanel.getByRole("button", { name: "Publicar versión", exact: true })
    ).toHaveCount(0)

    // --- Assign a branch (Requirement 4.5) ---
    const assignmentsPanel = page.getByRole("group", {
      name: "Asignaciones de sucursal",
    })
    await expect(assignmentsPanel).toBeVisible()
    await expect(
      assignmentsPanel.getByText("No hay sucursales asignadas.")
    ).toBeVisible()

    await assignmentsPanel
      .getByLabel("Sucursal", { exact: true })
      .selectOption("branch-1")
    await assignmentsPanel
      .getByRole("button", { name: "Asignar sucursal", exact: true })
      .click()

    await expect(
      assignmentsPanel.getByText("Operación completada.", { exact: true })
    ).toBeVisible()
    await expect(
      assignmentsPanel.getByRole("listitem").filter({ hasText: BRANCH_NAME })
    ).toBeVisible()

    // --- Fetch the QR (Requirement 4.6) ---
    const qrPanel = page.getByRole("group", {
      name: "Código QR del cuestionario",
    })
    await expect(qrPanel).toBeVisible()
    // Nothing is derived optimistically before the request settles.
    await expect(
      qrPanel.getByRole("img", { name: "Imagen del código QR" })
    ).toHaveCount(0)

    await qrPanel.getByRole("button", { name: "Obtener QR", exact: true }).click()

    await expect(
      qrPanel.getByRole("img", { name: "Imagen del código QR" })
    ).toBeVisible()
    const scanUrl = "https://form-qr.example/scan/token-q-1"
    const scanLink = qrPanel.getByRole("link", { name: scanUrl })
    await expect(scanLink).toHaveAttribute("href", scanUrl)
  })
})
