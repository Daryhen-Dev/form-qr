import { expect, test, type Page } from "@playwright/test"

const viewports = [320, 375, 768, 1440] as const

function getLoginControls(page: Page) {
  return {
    cedula: page.getByLabel("Cédula", { exact: true }),
    password: page.getByLabel("Contraseña", { exact: true }),
    submit: page.getByRole("button", { name: "Iniciar sesión", exact: true }),
  }
}

test.describe("Login UI", () => {
  test("supports keyboard navigation and submission", async ({ page }) => {
    await page.goto("/")

    const { cedula, password, submit } = getLoginControls(page)

    await expect(cedula).toBeVisible()
    await page.keyboard.press("Tab")
    await expect(cedula).toBeFocused()

    await page.keyboard.type("123")
    await page.keyboard.press("Tab")
    await expect(password).toBeFocused()

    await page.keyboard.type("password")
    await page.keyboard.press("Tab")
    await expect(submit).toBeFocused()

    await page.keyboard.press("Shift+Tab")
    await expect(password).toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(cedula).toBeFocused()

    await page.keyboard.press("Tab")
    await page.keyboard.press("Tab")
    await expect(submit).toBeFocused()
    await page.keyboard.press("Enter")

    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByText("Ingrese una cédula de 6 a 15 dígitos."),
    ).toBeVisible()
    await expect(cedula).toBeFocused()
  })

  for (const width of viewports) {
    test(`fits the login form without horizontal overflow at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto("/")

      await expect(getLoginControls(page).submit).toBeVisible()

      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))

      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth)
    })
  }
})
