import { expect, test, type Page } from "@playwright/test"

const ROLE_STARTS = [
  { role: "Administrador", heading: "Operaciones" },
  { role: "Secretario", heading: "Operaciones" },
  { role: "Empleado", heading: "Cuestionarios asignados" },
] as const

const LOGIN = {
  CEDULA: "123456",
  PASSWORD: "current-password",
  RETRYABLE_FAILURE: "No fue posible iniciar sesión. Inténtelo nuevamente.",
} as const

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

  await page.route("**/api/v1/auth/change-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    })
  })
}

async function submitLogin(page: Page) {
  const login = getLoginControls(page)
  await login.cedula.fill(LOGIN.CEDULA)
  await login.password.fill(LOGIN.PASSWORD)
  await login.submit.click()
}

test.describe("Operational access", () => {
  test("keeps the login surface for absent and unrecognized access contexts", async ({
    page,
  }) => {
    await stubAuth(page, loginPayload("Supervisor", false))
    await page.goto("/")

    const login = getLoginControls(page)
    await expect(login.heading).toBeVisible()
    await expect(login.submit).toBeVisible()
    await expect(page.getByText("Acceso habilitado.", { exact: true })).toHaveCount(0)

    await submitLogin(page)

    await expect(login.heading).toBeVisible()
    await expect(login.submit).toBeVisible()
    await expect(
      page.getByText(LOGIN.RETRYABLE_FAILURE, { exact: true }),
    ).toBeVisible()
    await expect(page.getByText("Acceso habilitado.", { exact: true })).toHaveCount(0)
  })

  for (const { role, heading } of ROLE_STARTS) {
    test(`opens the ${role} start view after a permitted login`, async ({ page }) => {
      await stubAuth(page, loginPayload(role, false))
      await page.goto("/")
      await submitLogin(page)

      await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
      await expect(page.getByText("Acceso habilitado.", { exact: true })).toBeVisible()
      await expect(getLoginControls(page).heading).toHaveCount(0)
    })
  }

  test("limits a restricted login to the mandatory password-change flow", async ({
    page,
  }) => {
    await stubAuth(page, loginPayload("Administrador", true))
    await page.goto("/")
    await submitLogin(page)

    await expect(
      page.getByRole("heading", {
        name: "Cambio de contraseña obligatorio",
        exact: true,
      }),
    ).toBeVisible()
    await expect(page.getByLabel("Nueva contraseña", { exact: true })).toBeVisible()
    await expect(
      page.getByLabel("Confirmar nueva contraseña", { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Cambiar contraseña", exact: true }),
    ).toBeVisible()
    await expect(getLoginControls(page).heading).toHaveCount(0)
    await expect(page.getByText("Acceso habilitado.", { exact: true })).toHaveCount(0)
  })
})
