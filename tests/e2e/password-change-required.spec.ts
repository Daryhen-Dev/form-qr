import { expect, test, type Page, type Route } from "@playwright/test"

const RESTRICTED_LOGIN_PAYLOAD = {
  accessToken: "restricted-access-token",
  refreshToken: "restricted-refresh-token",
  user: { id: "user-1", cedula: "123456", role: "Administrador" },
  passwordChangeRequired: true,
} as const

const VALID_CEDULA = "123456"
const VALID_PASSWORD = "current-password"
const NEW_PASSWORD = "new-password-123"

// Safe, localized copy the Modo_de_Cambio_Obligatorio must surface. Mirrors
// PASSWORD_CHANGE_STATUS_MESSAGE without importing the module so the E2E stays
// free of path-alias resolution in the Playwright transform.
const CHANGE_MESSAGE = {
  NEW_LOGIN_REQUIRED: "Se requiere un nuevo inicio de sesión.",
  VALIDATION_ERROR: "No fue posible validar la nueva contraseña.",
  RETRYABLE_FAILURE: "No fue posible completar el cambio. Inténtelo nuevamente.",
} as const

type ChangeResponse = { status: number; body: unknown }

// Role/label control groups returned by the selector helpers below. Deriving
// the types keeps a single source of truth for every stabilized selector.
type LoginControls = ReturnType<typeof getLoginControls>
type PasswordChangeControls = ReturnType<typeof getPasswordChangeControls>

// Restricted login stub shared by every traversal: valid credentials always
// yield passwordChangeRequired: true so the flow reaches the mandatory change.
async function stubRestrictedLogin(page: Page) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(RESTRICTED_LOGIN_PAYLOAD),
    })
  })
}

// Fulfill successive change-password calls from a sequence so retry traversals
// can fail first and succeed on the next attempt. The last entry repeats once
// the sequence is exhausted.
async function stubChangePasswordSequence(
  page: Page,
  responses: readonly ChangeResponse[],
) {
  let index = 0

  await page.route("**/api/v1/auth/change-password", async (route: Route) => {
    const response = responses[Math.min(index, responses.length - 1)]
    index += 1
    await route.fulfill({
      status: response.status,
      contentType: "application/json",
      body: JSON.stringify(response.body),
    })
  })
}

// Single successful change-password fulfilment reused by every happy-path and
// retry traversal that ends in a 200 { success: true }.
const CHANGE_SUCCESS: readonly ChangeResponse[] = [
  { status: 200, body: { success: true } },
]

// Change responses reused across the error/retry traversals. Consolidating them
// keeps every stubbed status/body in one place so a traversal only names the
// branch it exercises:
//   - CHANGE_NEW_PASSWORD_422: a 422 whose first issue path is newPassword,
//     surfacing the localized field error beside «Nueva contraseña» (Req 4.7).
//   - CHANGE_GENERIC_422: a 422 with any other issue path, yielding the safe
//     retryable status with no field error (Req 4.8).
//   - CHANGE_UNAUTHORIZED_401: a 401 that forces a return to a new login (Req 4.6).
const CHANGE_NEW_PASSWORD_422: ChangeResponse = {
  status: 422,
  body: { issues: [{ path: ["newPassword"], message: "too weak" }] },
}

const CHANGE_GENERIC_422: ChangeResponse = {
  status: 422,
  body: { issues: [{ path: ["confirmPassword"], message: "mismatch" }] },
}

const CHANGE_UNAUTHORIZED_401: ChangeResponse = { status: 401, body: {} }

// Restricted login plus a single successful change response: the shared setup
// for traversals that reach and complete the mandatory change.
async function stubAuthEndpoints(page: Page) {
  await stubRestrictedLogin(page)
  await stubChangePasswordSequence(page, CHANGE_SUCCESS)
}

function getLoginControls(page: Page) {
  return {
    cedula: page.getByLabel("Cédula", { exact: true }),
    password: page.getByLabel("Contraseña", { exact: true }),
    submit: page.getByRole("button", { name: "Iniciar sesión", exact: true }),
  }
}

function getPasswordChangeControls(page: Page) {
  return {
    heading: page.getByRole("heading", {
      name: "Cambio de contraseña obligatorio",
      exact: true,
    }),
    newPassword: page.getByLabel("Nueva contraseña", { exact: true }),
    confirmPassword: page.getByLabel("Confirmar nueva contraseña", {
      exact: true,
    }),
    submit: page.getByRole("button", { name: "Cambiar contraseña", exact: true }),
  }
}

// Scope the accessible status region to the change form so its own live region
// (role="status", aria-live) stays isolated from the persistent restricted-mode
// banner, which is another role="status" live region on the page (Req 5.2).
function getChangeStatusRegion(page: Page, change: PasswordChangeControls) {
  return page
    .locator("form")
    .filter({ has: change.heading })
    .getByRole("status")
}

// Drive the restricted login so the mandatory change form is mounted, then
// return both control groups for the traversal under test.
async function reachChangeMode(page: Page) {
  await page.goto("/")

  const login = getLoginControls(page)
  await expect(login.cedula).toBeVisible()
  await login.cedula.fill(VALID_CEDULA)
  await login.password.fill(VALID_PASSWORD)
  await login.submit.click()

  const change = getPasswordChangeControls(page)
  await expect(change.heading).toBeVisible()

  return { login, change }
}

// Fill both change inputs with the same value and activate the submit control.
// Consolidates the fill/fill/click block every traversal repeats.
async function submitPasswordChange(
  change: PasswordChangeControls,
  password: string = NEW_PASSWORD,
) {
  await change.newPassword.fill(password)
  await change.confirmPassword.fill(password)
  await change.submit.click()
}

// Assert the restricted mode was dropped and the login form returned with its
// submit control (Req 4.3, 4.4). Callers add any traversal-specific checks.
async function expectReturnedToLogin(
  login: LoginControls,
  change: PasswordChangeControls,
) {
  await expect(change.heading).toBeHidden()
  await expect(login.cedula).toBeVisible()
  await expect(login.submit).toBeVisible()
}

// Assert that a Secreto never leaks into the rendered page or the URL after a
// traversal completes (Req 4.1, 4.11).
async function expectNoSecretExposure(page: Page, secret: string) {
  expect(page.url()).not.toContain(secret)
  await expect(page.getByText(secret, { exact: false })).toHaveCount(0)
}

test.describe("Mandatory password change", () => {
  test("completes the restricted login to change to login flow", async ({
    page,
  }) => {
    await stubAuthEndpoints(page)

    // Restricted login: valid credentials produce passwordChangeRequired: true
    // and mount the Modo_de_Cambio_Obligatorio.
    const { login, change } = await reachChangeMode(page)

    // Modo_de_Cambio_Obligatorio is presented with title and labeled inputs
    // (Req 1.1). The login inputs are withdrawn while restricted (Req 4.3/4.4).
    await expect(change.newPassword).toBeVisible()
    await expect(change.confirmPassword).toBeVisible()
    await expect(change.submit).toBeVisible()
    await expect(login.cedula).toBeHidden()

    // Complete the change with a valid new password and matching confirmation.
    await submitPasswordChange(change)

    // After 200 { success: true } the restricted mode is dropped and the login
    // form returns for a brand-new authentication (Req 4.1, 4.3, 4.4).
    await expectReturnedToLogin(login, change)
    await expect(login.password).toBeVisible()

    // No secret from the change lingers in the returned login inputs (Req 4.1).
    await expect(login.cedula).toHaveValue("")
    await expect(login.password).toHaveValue("")
  })

  test("initial focus lands on the new password input", async ({ page }) => {
    await stubAuthEndpoints(page)

    const { change } = await reachChangeMode(page)

    // The Modo_de_Cambio_Obligatorio assigns the initial focus to «Nueva
    // contraseña» when it becomes visible (Req 1.2).
    await expect(change.newPassword).toBeFocused()
  })

  test("moves focus once per control in visual reading order", async ({
    page,
  }) => {
    await stubAuthEndpoints(page)

    const { change } = await reachChangeMode(page)

    // Keyboard navigation walks the enabled controls once each, forward and
    // backward, in the visual reading order (Req 1.3).
    await expect(change.newPassword).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(change.confirmPassword).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(change.submit).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(change.confirmPassword).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(change.newPassword).toBeFocused()
  })

  test("returns to login with a safe message after a 401 change response", async ({
    page,
  }) => {
    await stubRestrictedLogin(page)
    await stubChangePasswordSequence(page, [CHANGE_UNAUTHORIZED_401])

    const { login, change } = await reachChangeMode(page)
    await expect(change.newPassword).toBeFocused()

    await submitPasswordChange(change)

    // A 401 drops the restricted mode, returns to the login form and surfaces
    // the safe NEW_LOGIN_REQUIRED status (Req 4.6).
    await expectReturnedToLogin(login, change)
    await expect(
      page.getByText(CHANGE_MESSAGE.NEW_LOGIN_REQUIRED, { exact: true }),
    ).toBeVisible()

    // No secret survives the transition to the returned login form (Req 4.1).
    await expect(login.cedula).toHaveValue("")
    await expect(login.password).toHaveValue("")
    await expectNoSecretExposure(page, NEW_PASSWORD)
    await expectNoSecretExposure(page, RESTRICTED_LOGIN_PAYLOAD.accessToken)
  })

  test("shows the localized field error on 422 newPassword and allows a retry", async ({
    page,
  }) => {
    await stubRestrictedLogin(page)
    await stubChangePasswordSequence(page, [
      CHANGE_NEW_PASSWORD_422,
      ...CHANGE_SUCCESS,
    ])

    const { login, change } = await reachChangeMode(page)

    await submitPasswordChange(change)

    // A 422 pointing at newPassword shows the safe field error beside «Nueva
    // contraseña», keeps the change mode active and permits a retry (Req 4.7).
    await expect(
      page.getByText(CHANGE_MESSAGE.VALIDATION_ERROR, { exact: true }),
    ).toBeVisible()
    await expect(change.newPassword).toHaveAttribute("aria-invalid", "true")
    await expect(change.heading).toBeVisible()
    await expect(change.submit).toBeEnabled()

    // Retry from a clean surface: the inputs were wiped, so refill and succeed.
    await expect(change.newPassword).toHaveValue("")
    await submitPasswordChange(change)

    await expectReturnedToLogin(login, change)
  })

  test("shows the retryable message on a generic 422 and allows a retry", async ({
    page,
  }) => {
    await stubRestrictedLogin(page)
    await stubChangePasswordSequence(page, [CHANGE_GENERIC_422, ...CHANGE_SUCCESS])

    const { login, change } = await reachChangeMode(page)

    await submitPasswordChange(change)

    // A 422 without a newPassword issue stays in change mode with the safe
    // retryable status and no field error (Req 4.8).
    await expect(
      page.getByText(CHANGE_MESSAGE.RETRYABLE_FAILURE, { exact: true }),
    ).toBeVisible()
    await expect(change.newPassword).not.toHaveAttribute("aria-invalid", "true")
    await expect(change.heading).toBeVisible()
    await expect(change.submit).toBeEnabled()

    // Retry from a clean surface succeeds and returns to the login form.
    await expect(change.newPassword).toHaveValue("")
    await submitPasswordChange(change)

    await expectReturnedToLogin(login, change)
  })

  // Feature cambio-obligatorio-contrasena Property 5.
  // Property 5: Accesibilidad completa — inputs con etiquetas y nombre
  // accesible, enmascarado, foco inicial en «Nueva contraseña», orden de
  // tabulado visual, error de campo asociado por aria-invalid/aria-describedby
  // y región de estado accesible (role="status", aria-live).
  // Validates: Requirements 1.1, 1.2, 1.3, 2.6, 5.1, 5.2, 5.3
  test("keeps the mandatory change surface accessible across labels, focus, tab order and status regions", async ({
    page,
  }) => {
    await stubRestrictedLogin(page)
    // First a 422 pointing at newPassword (field error), then a generic 422
    // (retryable status) so the single traversal exercises both accessible
    // announcement channels in the mandatory change mode.
    await stubChangePasswordSequence(page, [
      CHANGE_NEW_PASSWORD_422,
      CHANGE_GENERIC_422,
    ])

    const { change } = await reachChangeMode(page)

    // Req 1.1/1.2: each input is reachable by its visible label (accessible
    // name) and both secrets are masked via type=password.
    await expect(change.newPassword).toBeVisible()
    await expect(change.confirmPassword).toBeVisible()
    await expect(change.newPassword).toHaveAttribute("type", "password")
    await expect(change.confirmPassword).toHaveAttribute("type", "password")

    // Req 1.2: the mandatory change mode assigns the initial focus to «Nueva
    // contraseña» as soon as it mounts.
    await expect(change.newPassword).toBeFocused()

    // Req 1.3/5.3: Tab and Shift+Tab move the focus once per enabled control in
    // the visual reading order.
    await page.keyboard.press("Tab")
    await expect(change.confirmPassword).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(change.submit).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(change.confirmPassword).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(change.newPassword).toBeFocused()

    // Req 2.6/5.1: a 422 newPassword marks the input invalid and associates the
    // localized field error via aria-describedby so assistive tech announces it.
    await submitPasswordChange(change)
    await expect(change.newPassword).toHaveAttribute("aria-invalid", "true")

    const describedBy = await change.newPassword.getAttribute("aria-describedby")
    expect(describedBy).toBeTruthy()

    const fieldError = page.locator(`#${describedBy}`)
    await expect(fieldError).toHaveText(CHANGE_MESSAGE.VALIDATION_ERROR)

    // Req 5.2: the status message is surfaced through an accessible live status
    // region. Retry with a generic 422 to reach the retryable status branch.
    // The helper scopes to the change form's own status region.
    await submitPasswordChange(change)

    const statusRegion = getChangeStatusRegion(page, change)
    await expect(statusRegion).toHaveText(CHANGE_MESSAGE.RETRYABLE_FAILURE)
    await expect(statusRegion).toHaveAttribute("aria-live", "polite")
  })
})
