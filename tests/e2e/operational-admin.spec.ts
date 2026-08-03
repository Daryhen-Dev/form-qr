import { expect, test, type Page, type Route } from "@playwright/test"

/**
 * Integrated administration coverage for users, branches, and employee
 * assignments over the existing `/api/v1` contracts.
 *
 * Because the in-memory access context only exists after a login within the
 * same document, each scenario authenticates directly on the target protected
 * route (following operational-access/operational-navigation): the login
 * surface is presented first, and a successful login lets the route gate render
 * the role-scoped admin shell without a full reload.
 *
 * Covers: Administrador CRUD of users and branches; Secretario read-only
 * consultation of branches and Empleado-only user creation; and employee-to-
 * branch assignment (list + consult current branch/history + assign). Failure
 * mapping for HTTP 422 (field issues) and HTTP 409 (conflict, data preserved)
 * is exercised on the admin surfaces.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

const LOGIN = {
  CEDULA: "123456",
  PASSWORD: "current-password",
} as const

const SAFE_MESSAGE = {
  SUCCESS: "Operación completada.",
  CONFLICT: "Los datos cambiaron. Revisá la información e intentá nuevamente.",
  FIELD_ISSUE: "Revisá este campo.",
} as const

const TIMESTAMP = "2024-01-01T00:00:00.000Z"

type Role = "Administrador" | "Secretario" | "Empleado"

interface UserRecord {
  id: string
  nombres: string
  apellidos: string
  cedula: string
  role: Role
  passwordChangeRequired: boolean
  createdAt: string
  updatedAt: string
}

interface BranchRecord {
  id: string
  name: string
  code: string | null
  address: string | null
  createdAt: string
  updatedAt: string
}

interface AssignmentRecord {
  id: string
  branchId: string
  userId: string
  assignedAt: string
  unassignedAt: string | null
}

function userRecord(over: Partial<UserRecord> & { id: string }): UserRecord {
  return {
    nombres: "Nombre",
    apellidos: "Apellido",
    cedula: "0000000000",
    role: "Empleado",
    passwordChangeRequired: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...over,
  }
}

function branchRecord(over: Partial<BranchRecord> & { id: string }): BranchRecord {
  return {
    name: "Sucursal",
    code: null,
    address: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...over,
  }
}

function loginPayload(role: Role) {
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

async function stubAuth(page: Page, role: Role) {
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(loginPayload(role)),
    })
  })
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

/**
 * Authenticate on the currently loaded protected route so the route gate can
 * render the role shell in the same document (in-memory access is preserved).
 */
async function loginOnCurrentRoute(page: Page, role: Role) {
  await stubAuth(page, role)

  const login = getLoginControls(page)
  await expect(login.heading).toBeVisible()
  await login.cedula.fill(LOGIN.CEDULA)
  await login.password.fill(LOGIN.PASSWORD)
  await login.submit.click()
}

test.describe("Operational administration", () => {
  test("Administrador performs full CRUD over users", async ({ page }) => {
    // Stateful users collection backing GET/POST/PATCH/DELETE.
    const users: UserRecord[] = [
      userRecord({
        id: "user-1",
        nombres: "Ada",
        apellidos: "Lovelace",
        cedula: "0101010101",
        role: "Empleado",
      }),
    ]
    let sequence = 1

    await page.route("**/api/v1/users", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        return fulfillJson(route, 200, { users })
      }
      if (method === "POST") {
        const body = jsonBody(route)
        const created = userRecord({
          id: `user-${++sequence}`,
          nombres: String(body.nombres),
          apellidos: String(body.apellidos),
          cedula: String(body.cedula),
          role: body.role as Role,
        })
        users.push(created)
        return fulfillJson(route, 201, { user: created })
      }
      return route.fallback()
    })

    await page.route("**/api/v1/users/*", async (route) => {
      const method = route.request().method()
      const id = decodeURIComponent(
        new URL(route.request().url()).pathname.split("/").pop() ?? ""
      )
      const index = users.findIndex((user) => user.id === id)

      if (method === "PATCH" && index !== -1) {
        const body = jsonBody(route)
        users[index] = {
          ...users[index],
          nombres: String(body.nombres ?? users[index].nombres),
          apellidos: String(body.apellidos ?? users[index].apellidos),
        }
        return fulfillJson(route, 200, { user: users[index] })
      }
      if (method === "DELETE" && index !== -1) {
        users.splice(index, 1)
        return fulfillJson(route, 200, { success: true })
      }
      return route.fallback()
    })

    await page.goto("/operaciones/usuarios")
    await loginOnCurrentRoute(page, "Administrador")

    await expect(
      page.getByRole("heading", { name: "Usuarios", exact: true })
    ).toBeVisible()
    await expect(page.getByText("Ada Lovelace", { exact: false })).toBeVisible()

    // CREATE
    await page.getByRole("button", { name: "Nuevo usuario", exact: true }).click()
    const createForm = page.getByRole("group", { name: "Crear usuario" })
    await createForm.getByLabel("Nombres", { exact: true }).fill("Grace")
    await createForm.getByLabel("Apellidos", { exact: true }).fill("Hopper")
    await createForm.getByLabel("Cédula", { exact: true }).fill("0202020202")
    await createForm.getByLabel("Rol", { exact: true }).selectOption("Empleado")
    await createForm.getByRole("button", { name: "Guardar", exact: true }).click()

    await expect(page.getByText("Grace Hopper", { exact: false })).toBeVisible()
    await expect(page.getByRole("group", { name: "Crear usuario" })).toHaveCount(0)

    // EDIT
    const graceRow = page
      .getByRole("listitem")
      .filter({ hasText: "Grace Hopper" })
    await graceRow.getByRole("button", { name: "Editar", exact: true }).click()
    const editForm = page.getByRole("group", { name: "Editar usuario" })
    await editForm.getByLabel("Nombres", { exact: true }).fill("Grace B.")
    await editForm.getByRole("button", { name: "Guardar", exact: true }).click()

    await expect(page.getByText("Grace B. Hopper", { exact: false })).toBeVisible()

    // DELETE
    const adaRow = page.getByRole("listitem").filter({ hasText: "Ada Lovelace" })
    await adaRow.getByRole("button", { name: "Desactivar", exact: true }).click()

    await expect(page.getByText("Ada Lovelace", { exact: false })).toHaveCount(0)
    await expect(page.getByText(SAFE_MESSAGE.SUCCESS, { exact: true })).toBeVisible()
  })

  test("Administrador performs full CRUD over branches", async ({ page }) => {
    const branches: BranchRecord[] = [
      branchRecord({ id: "branch-1", name: "Central", code: "C-001" }),
    ]
    let sequence = 1

    await page.route("**/api/v1/branches", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        return fulfillJson(route, 200, { branches })
      }
      if (method === "POST") {
        const body = jsonBody(route)
        const created = branchRecord({
          id: `branch-${++sequence}`,
          name: String(body.name),
          code: body.code === undefined ? null : String(body.code),
          address: body.address === undefined ? null : String(body.address),
        })
        branches.push(created)
        return fulfillJson(route, 201, { branch: created })
      }
      return route.fallback()
    })

    await page.route("**/api/v1/branches/*", async (route) => {
      const method = route.request().method()
      const id = decodeURIComponent(
        new URL(route.request().url()).pathname.split("/").pop() ?? ""
      )
      const index = branches.findIndex((branch) => branch.id === id)

      if (method === "PATCH" && index !== -1) {
        const body = jsonBody(route)
        branches[index] = {
          ...branches[index],
          name: String(body.name ?? branches[index].name),
          code: body.code === undefined ? branches[index].code : String(body.code),
        }
        return fulfillJson(route, 200, { branch: branches[index] })
      }
      if (method === "DELETE" && index !== -1) {
        branches.splice(index, 1)
        return fulfillJson(route, 200, { success: true })
      }
      return route.fallback()
    })

    await page.goto("/operaciones/sucursales")
    await loginOnCurrentRoute(page, "Administrador")

    await expect(
      page.getByRole("heading", { name: "Sucursales", exact: true })
    ).toBeVisible()
    await expect(page.getByText("Central", { exact: true })).toBeVisible()

    // CREATE
    await page.getByRole("button", { name: "Nueva sucursal", exact: true }).click()
    const createForm = page.getByRole("group", { name: "Crear sucursal" })
    await createForm.getByLabel("Nombre", { exact: true }).fill("Norte")
    await createForm.getByLabel("Código", { exact: true }).fill("N-002")
    await createForm.getByRole("button", { name: "Guardar", exact: true }).click()

    await expect(page.getByText("Norte", { exact: true })).toBeVisible()
    await expect(page.getByRole("group", { name: "Crear sucursal" })).toHaveCount(0)

    // EDIT
    const norteRow = page.getByRole("listitem").filter({ hasText: "Norte" })
    await norteRow.getByRole("button", { name: "Editar", exact: true }).click()
    const editForm = page.getByRole("group", { name: "Editar sucursal" })
    await editForm.getByLabel("Nombre", { exact: true }).fill("Norte Alta")
    await editForm.getByRole("button", { name: "Guardar", exact: true }).click()

    await expect(page.getByText("Norte Alta", { exact: true })).toBeVisible()

    // DELETE
    const centralRow = page.getByRole("listitem").filter({ hasText: "Central" })
    await centralRow.getByRole("button", { name: "Desactivar", exact: true }).click()

    await expect(page.getByText("Central", { exact: true })).toHaveCount(0)
    await expect(page.getByText(SAFE_MESSAGE.SUCCESS, { exact: true })).toBeVisible()
  })

  test("Secretario consults branches read-only without management controls", async ({
    page,
  }) => {
    const branches: BranchRecord[] = [
      branchRecord({ id: "branch-1", name: "Central", code: "C-001" }),
    ]

    await page.route("**/api/v1/branches", async (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, 200, { branches })
      }
      return route.fallback()
    })

    await page.goto("/operaciones/sucursales")
    await loginOnCurrentRoute(page, "Secretario")

    await expect(
      page.getByRole("heading", { name: "Sucursales", exact: true })
    ).toBeVisible()
    await expect(page.getByText("Central", { exact: true })).toBeVisible()

    // Read-only surface: create/edit/deactivate stay unavailable.
    await expect(
      page.getByRole("button", { name: "Nueva sucursal", exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Editar", exact: true })
    ).toHaveCount(0)
    await expect(
      page.getByRole("button", { name: "Desactivar", exact: true })
    ).toHaveCount(0)

    // The employee assignment entry remains available to the Secretario.
    await expect(
      page.getByRole("button", { name: "Empleados", exact: true })
    ).toBeVisible()
  })

  test("Secretario can only create Empleado users", async ({ page }) => {
    const users: UserRecord[] = [
      userRecord({
        id: "user-1",
        nombres: "Ada",
        apellidos: "Lovelace",
        role: "Empleado",
      }),
    ]
    let sequence = 1
    let createdRole: string | undefined

    await page.route("**/api/v1/users", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        return fulfillJson(route, 200, { users })
      }
      if (method === "POST") {
        const body = jsonBody(route)
        createdRole = String(body.role)
        const created = userRecord({
          id: `user-${++sequence}`,
          nombres: String(body.nombres),
          apellidos: String(body.apellidos),
          cedula: String(body.cedula),
          role: body.role as Role,
        })
        users.push(created)
        return fulfillJson(route, 201, { user: created })
      }
      return route.fallback()
    })

    await page.goto("/operaciones/usuarios")
    await loginOnCurrentRoute(page, "Secretario")

    await expect(
      page.getByRole("heading", { name: "Usuarios", exact: true })
    ).toBeVisible()

    await page.getByRole("button", { name: "Nuevo usuario", exact: true }).click()
    const createForm = page.getByRole("group", { name: "Crear usuario" })

    // The role selector is constrained to Empleado for a Secretario.
    const roleSelect = createForm.getByLabel("Rol", { exact: true })
    await expect(roleSelect.getByRole("option")).toHaveCount(1)
    await expect(roleSelect.getByRole("option", { name: "Empleado" })).toHaveCount(1)

    await createForm.getByLabel("Nombres", { exact: true }).fill("Katherine")
    await createForm.getByLabel("Apellidos", { exact: true }).fill("Johnson")
    await createForm.getByLabel("Cédula", { exact: true }).fill("0303030303")
    await createForm.getByRole("button", { name: "Guardar", exact: true }).click()

    await expect(page.getByText("Katherine Johnson", { exact: false })).toBeVisible()
    expect(createdRole).toBe("Empleado")
  })

  test("assigns an employee to a branch and consults its branch history", async ({
    page,
  }) => {
    const branches: BranchRecord[] = [
      branchRecord({ id: "branch-1", name: "Central", code: "C-001" }),
    ]
    const employee = userRecord({
      id: "emp-1",
      nombres: "Rosa",
      apellidos: "Parks",
      role: "Empleado",
    })
    const assignments: AssignmentRecord[] = []
    let assignedUserId: string | undefined

    await page.route("**/api/v1/branches", async (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, 200, { branches })
      }
      return route.fallback()
    })

    await page.route("**/api/v1/users", async (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, 200, { users: [employee] })
      }
      return route.fallback()
    })

    await page.route("**/api/v1/users/*/branch", async (route) => {
      if (route.request().method() === "GET") {
        return fulfillJson(route, 200, {
          branch: assignedUserId
            ? branches[0]
            : null,
          history: assignments.map((assignment) => assignment),
        })
      }
      return route.fallback()
    })

    await page.route("**/api/v1/branches/*/employees", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        return fulfillJson(route, 200, { employees: assignments })
      }
      if (method === "POST") {
        const body = jsonBody(route)
        assignedUserId = String(body.userId)
        const created: AssignmentRecord = {
          id: `assignment-${assignments.length + 1}`,
          branchId: "branch-1",
          userId: assignedUserId,
          assignedAt: TIMESTAMP,
          unassignedAt: null,
        }
        assignments.push(created)
        return fulfillJson(route, 201, { assignment: created })
      }
      return route.fallback()
    })

    await page.goto("/operaciones/sucursales")
    await loginOnCurrentRoute(page, "Administrador")

    await expect(
      page.getByRole("heading", { name: "Sucursales", exact: true })
    ).toBeVisible()

    // Open the branch's embedded employee assignment panel.
    const centralRow = page.getByRole("listitem").filter({ hasText: "Central" })
    await centralRow.getByRole("button", { name: "Empleados", exact: true }).click()

    const panel = page.getByRole("group", { name: "Asignación de empleados" })
    await expect(panel).toBeVisible()
    await expect(panel.getByText("No hay empleados asignados.")).toBeVisible()

    // Select the employee, consult its current branch/history, then assign.
    await panel.getByLabel("Empleado", { exact: true }).selectOption("emp-1")
    await panel
      .getByRole("button", { name: "Ver sucursal e historial", exact: true })
      .click()
    await expect(panel.getByText("Sin asignación", { exact: false })).toBeVisible()

    await panel
      .getByRole("button", { name: "Asignar a la sucursal", exact: true })
      .click()

    await expect(panel.getByText(SAFE_MESSAGE.SUCCESS, { exact: true })).toBeVisible()
    await expect(
      panel.getByRole("listitem").filter({ hasText: "Rosa Parks" })
    ).toBeVisible()
    expect(assignedUserId).toBe("emp-1")
  })

  test("maps HTTP 422 to a field issue and HTTP 409 to a preserved conflict", async ({
    page,
  }) => {
    // --- 422 on user creation associates a field issue and keeps the form ---
    await page.route("**/api/v1/users", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        return fulfillJson(route, 200, { users: [] })
      }
      if (method === "POST") {
        return fulfillJson(route, 422, {
          issues: [{ path: ["nombres"], message: "internal detail" }],
        })
      }
      return route.fallback()
    })

    await page.goto("/operaciones/usuarios")
    await loginOnCurrentRoute(page, "Administrador")

    await page.getByRole("button", { name: "Nuevo usuario", exact: true }).click()
    const userForm = page.getByRole("group", { name: "Crear usuario" })
    await userForm.getByLabel("Nombres", { exact: true }).fill("X")
    await userForm.getByLabel("Apellidos", { exact: true }).fill("Y")
    await userForm.getByLabel("Cédula", { exact: true }).fill("0404040404")
    await userForm.getByRole("button", { name: "Guardar", exact: true }).click()

    // Field issue is associated with the affected control; the raw server
    // detail is never surfaced and the form stays open for correction.
    const nombres = userForm.getByLabel("Nombres", { exact: true })
    await expect(nombres).toHaveAttribute("aria-invalid", "true")
    await expect(userForm.getByText(SAFE_MESSAGE.FIELD_ISSUE, { exact: true })).toBeVisible()
    await expect(page.getByText("internal detail")).toHaveCount(0)
    await expect(userForm).toBeVisible()
    await expect(nombres).toHaveValue("X")

    // --- 409 on branch creation preserves the draft and shows a safe message ---
    await page.route("**/api/v1/branches", async (route) => {
      const method = route.request().method()
      if (method === "GET") {
        return fulfillJson(route, 200, { branches: [] })
      }
      if (method === "POST") {
        return fulfillJson(route, 409, {})
      }
      return route.fallback()
    })

    await page.goto("/operaciones/sucursales")
    await loginOnCurrentRoute(page, "Administrador")

    await page.getByRole("button", { name: "Nueva sucursal", exact: true }).click()
    const branchForm = page.getByRole("group", { name: "Crear sucursal" })
    await branchForm.getByLabel("Nombre", { exact: true }).fill("Duplicada")
    await branchForm.getByRole("button", { name: "Guardar", exact: true }).click()

    await expect(page.getByText(SAFE_MESSAGE.CONFLICT, { exact: true })).toBeVisible()
    await expect(branchForm).toBeVisible()
    await expect(branchForm.getByLabel("Nombre", { exact: true })).toHaveValue(
      "Duplicada"
    )
  })
})
