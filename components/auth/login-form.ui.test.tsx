import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import fc from "fast-check"
import { afterEach, describe, expect, it, vi } from "vitest"

import { LoginForm } from "./login-form"

const VALID_CREDENTIALS = {
  cedula: "123456",
  password: "password-segura",
}

const INVALID_CREDENTIALS_MESSAGE =
  "No fue posible iniciar sesión. Verifique sus credenciales e inténtelo nuevamente."
const RETRYABLE_FAILURE_MESSAGE = "No fue posible iniciar sesión. Inténtelo nuevamente."
const REVIEW_FIELDS_MESSAGE = "Revise los campos indicados."

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function createJsonResponse(status: number, payload: unknown): Response {
  const body = JSON.stringify(payload)

  return {
    status,
    json: async () => payload,
    text: async () => body,
  } as Response
}

function mockFetch(response: FetchMock) {
  const fetchMock = vi.fn<FetchMock>(response)

  vi.stubGlobal("fetch", fetchMock)

  return fetchMock
}

function createSuccessfulLoginResponse(): Response {
  return createJsonResponse(200, {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    user: { id: "user-1" },
    passwordChangeRequired: false,
  })
}

function expectShadcnField(labelText: string, input: HTMLElement) {
  const label = screen.getByText(labelText, { selector: "label" })

  expect(label).toHaveAttribute("data-slot", "label")
  expect(label).toHaveAttribute("for", input.id)
  expect(input).toHaveAttribute("data-slot", "input")
}

function expectAccessibleFieldError(input: HTMLElement, message: string) {
  expect(input).toHaveAttribute("aria-invalid", "true")
  expect(input).toHaveAccessibleDescription(message)
  expect(screen.getByText(message)).toBeInTheDocument()
}

function getForm() {
  const form = screen.getByRole("button").closest("form")

  if (form === null) {
    throw new Error("LoginForm must render a form element.")
  }

  return form
}

async function fillValidCredentials(user: ReturnType<typeof userEvent.setup>) {
  const cedula = screen.getByLabelText("Cédula")
  const password = screen.getByLabelText("Contraseña")

  await user.type(cedula, VALID_CREDENTIALS.cedula)
  await user.type(password, VALID_CREDENTIALS.password)

  return { cedula, password }
}

async function submitWith(activation: "click" | "enter") {
  const fetchMock = mockFetch(() => Promise.resolve(createSuccessfulLoginResponse()))
  const user = userEvent.setup()
  const { unmount } = render(<LoginForm />)

  try {
    const { password } = await fillValidCredentials(user)

    if (activation === "click") {
      await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))
    } else {
      await user.type(password, "{enter}")
    }

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    return fetchMock.mock.calls[0]
  } finally {
    unmount()
    vi.unstubAllGlobals()
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("LoginForm", () => {
  it("compone primitivas shadcn, enlaza etiquetas, enmascara la contraseña y anuncia errores locales", async () => {
    const user = userEvent.setup()

    render(<LoginForm />)

    const cedula = screen.getByLabelText("Cédula")
    const password = screen.getByLabelText("Contraseña")
    const submitButton = screen.getByRole("button", { name: "Iniciar sesión" })

    expectShadcnField("Cédula", cedula)
    expectShadcnField("Contraseña", password)
    expect(password).toHaveAttribute("type", "password")
    expect(submitButton).toHaveAttribute("data-slot", "button")
    expect(submitButton).toHaveAttribute("type", "submit")

    await user.click(submitButton)

    const alerts = screen.getAllByRole("alert")

    expectAccessibleFieldError(cedula, "Ingrese una cédula de 6 a 15 dígitos.")
    expectAccessibleFieldError(password, "La contraseña es obligatoria.")
    expect(alerts).toHaveLength(2)
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dataset: expect.objectContaining({ slot: "alert" }) }),
      ])
    )
    expect(cedula).toHaveFocus()
  })

  it("produce la misma solicitud al activar el envío con click o Enter", async () => {
    const clickInvocation = await submitWith("click")
    const enterInvocation = await submitWith("enter")

    expect(clickInvocation).toEqual(enterInvocation)
  })

  it("anuncia estado pendiente con aria-busy y termina correctamente tras un 200", async () => {
    let resolveResponse: (response: Response) => void = () => undefined
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve
    })
    const fetchMock = mockFetch(() => response)
    const user = userEvent.setup()

    render(<LoginForm />)

    await fillValidCredentials(user)
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(getForm()).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: "Iniciando sesión…" })).toBeDisabled()

    resolveResponse(
      createJsonResponse(200, {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: { id: "user-1" },
        passwordChangeRequired: false,
      })
    )

    await waitFor(() => expect(getForm()).toHaveAttribute("aria-busy", "false"))
    expect(screen.queryByText(RETRYABLE_FAILURE_MESSAGE)).not.toBeInTheDocument()
  })

  it("muestra un mensaje genérico, conserva la cédula y limpia la contraseña tras un 401", async () => {
    const fetchMock = mockFetch(() => Promise.resolve(createJsonResponse(401, {})))
    const user = userEvent.setup()

    render(<LoginForm />)

    const { cedula, password } = await fillValidCredentials(user)
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(INVALID_CREDENTIALS_MESSAGE)
    )
    expect(cedula).toHaveValue(VALID_CREDENTIALS.cedula)
    expect(password).toHaveValue("")
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled()
  })

  it("asocia los problemas 422 reconocidos, conserva la cédula y limpia la contraseña", async () => {
    const fetchMock = mockFetch(() =>
      Promise.resolve(
        createJsonResponse(422, {
          error: "validation_failed",
          issues: [{ path: ["cedula"] }, { path: ["password"] }],
        })
      )
    )
    const user = userEvent.setup()

    render(<LoginForm />)

    const { cedula, password } = await fillValidCredentials(user)
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(REVIEW_FIELDS_MESSAGE))
    expectAccessibleFieldError(cedula, "Ingrese una cédula de 6 a 15 dígitos.")
    expectAccessibleFieldError(password, "La contraseña es obligatoria.")
    expect(cedula).toHaveValue(VALID_CREDENTIALS.cedula)
    expect(password).toHaveValue("")
  })

  it("muestra un fallo seguro y reintentable cuando fetch no está disponible", async () => {
    const fetchMock = mockFetch(() => Promise.reject(new Error("network unavailable")))
    const user = userEvent.setup()

    render(<LoginForm />)

    const { cedula, password } = await fillValidCredentials(user)
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(RETRYABLE_FAILURE_MESSAGE))
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeEnabled()
    expect(cedula).toHaveValue(VALID_CREDENTIALS.cedula)
    expect(password).toHaveValue(VALID_CREDENTIALS.password)
    expect(screen.queryByText("network unavailable")).not.toBeInTheDocument()
  })
})


const PASSWORD_CHANGE_REQUIRED_MESSAGE =
  "Debe cambiar su contraseña antes de acceder a la aplicación."

const ALPHANUMERIC_CHARACTERS = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
]

// Fixtures y arbitrarios compartidos de sesión restringida: unifican los
// generadores repetidos de credenciales y secretos que consumen las
// propiedades del modo de cambio obligatorio.
interface RestrictedSessionCredentials {
  cedula: string
  password: string
}

const alphanumericString = (constraints: { minLength: number; maxLength: number }) =>
  fc
    .array(fc.constantFrom(...ALPHANUMERIC_CHARACTERS), constraints)
    .map((characters) => characters.join(""))

const restrictedCredentialsArbitrary = fc.record({
  cedula: fc
    .array(fc.integer({ min: 0, max: 9 }), { minLength: 6, maxLength: 15 })
    .map((digits) => digits.join("")),
  password: alphanumericString({ minLength: 1, maxLength: 24 }),
})

const prefixedSecretArbitrary = (prefix: string) =>
  alphanumericString({ minLength: 1, maxLength: 24 }).map((value) => `${prefix}_${value}`)

interface SecretTokens {
  accessToken: string
  refreshToken: string
}

interface PropertyLoginFixture {
  credentials: RestrictedSessionCredentials
  secrets: SecretTokens
}

interface PropertyLoginFields {
  cedula: HTMLElement
  password: HTMLElement
}

const propertyLoginFixtures = fc.record({
  credentials: restrictedCredentialsArbitrary,
  secrets: fc.record({
    accessToken: prefixedSecretArbitrary("access"),
    refreshToken: prefixedSecretArbitrary("refresh"),
  }),
})

interface PropertyLoginHarness {
  cedula: HTMLElement
  password: HTMLElement
  submit: (response: Response) => Promise<void>
  unmount: () => void
}

function createSecretLoginResponse(
  status: number,
  secrets: SecretTokens,
  payload: Record<string, unknown>
): Response {
  return createJsonResponse(status, { ...payload, ...secrets })
}

function renderPropertyLogin(credentials: RestrictedSessionCredentials): PropertyLoginHarness {
  const pendingResponses: Array<(response: Response) => void> = []
  const fetchMock = mockFetch(
    () =>
      new Promise<Response>((resolve) => {
        pendingResponses.push(resolve)
      })
  )
  const { unmount } = render(<LoginForm />)
  const cedula = screen.getByLabelText("Cédula")
  const password = screen.getByLabelText("Contraseña")
  const form = getForm()
  let requestCount = 0

  fireEvent.change(cedula, { target: { value: credentials.cedula } })
  fireEvent.change(password, { target: { value: credentials.password } })

  return {
    cedula,
    password,
    unmount,
    async submit(response) {
      requestCount += 1
      fireEvent.submit(form)
      expect(fetchMock).toHaveBeenCalledTimes(requestCount)

      const resolveResponse = pendingResponses.shift()

      if (resolveResponse === undefined) {
        throw new Error("Expected a pending login response.")
      }

      await act(async () => {
        resolveResponse(response)
      })

      expect(form).toHaveAttribute("aria-busy", "false")
    },
  }
}

function restorePropertyPassword(password: HTMLElement, value: string) {
  fireEvent.change(password, { target: { value } })
}

function expectNoSecretExposure(secrets: SecretTokens, fields: PropertyLoginFields) {
  const statusMessage = screen.queryByRole("status")?.textContent ?? ""
  const renderedDom = document.body.innerHTML
  const currentUrl = window.location.href
  const inputValues = Array.from(
    document.querySelectorAll<HTMLInputElement>("input"),
    (input) => input.value
  )

  for (const secret of Object.values(secrets)) {
    expect(statusMessage).not.toContain(secret)
    expect(renderedDom).not.toContain(secret)
    expect(currentUrl).not.toContain(secret)
    expect(inputValues).not.toContain(secret)
  }

  expect(fields.cedula).not.toHaveValue(secrets.accessToken)
  expect(fields.cedula).not.toHaveValue(secrets.refreshToken)
  expect(fields.password).not.toHaveValue(secrets.accessToken)
  expect(fields.password).not.toHaveValue(secrets.refreshToken)
}

describe("Propiedad 7", () => {
  it("no filtra tokens, limpia fallos y restringe el cambio obligatorio de contraseña", async () => {
    // Feature: login-ui, Property 7: Los secretos no se filtran y los fallos limpian la contraseña
    await fc.assert(
      fc.asyncProperty(propertyLoginFixtures, async (fixture: PropertyLoginFixture) => {
        const { credentials, secrets } = fixture
        const harness = renderPropertyLogin(credentials)
        const fields = { cedula: harness.cedula, password: harness.password }

        try {
          await harness.submit(createSecretLoginResponse(401, secrets, {}))
          expect(screen.getByRole("status")).toHaveTextContent(INVALID_CREDENTIALS_MESSAGE)
          expect(fields.cedula).toHaveValue(credentials.cedula)
          expect(fields.password).toHaveValue("")
          expectNoSecretExposure(secrets, fields)

          restorePropertyPassword(fields.password, credentials.password)
          await harness.submit(
            createSecretLoginResponse(422, secrets, {
              issues: [{ path: ["password"] }],
            })
          )
          expect(screen.getByRole("status")).toHaveTextContent(REVIEW_FIELDS_MESSAGE)
          expect(fields.cedula).toHaveValue(credentials.cedula)
          expect(fields.password).toHaveValue("")
          expectNoSecretExposure(secrets, fields)

          restorePropertyPassword(fields.password, credentials.password)
          await harness.submit(
            createSecretLoginResponse(200, secrets, {
              user: { id: "user-1" },
              passwordChangeRequired: false,
            })
          )
          expect(screen.queryByRole("status")).not.toBeInTheDocument()
          expectNoSecretExposure(secrets, fields)

          await harness.submit(
            createSecretLoginResponse(200, secrets, {
              user: { id: "user-1" },
              passwordChangeRequired: true,
            })
          )
          expect(screen.getByRole("status")).toHaveTextContent(PASSWORD_CHANGE_REQUIRED_MESSAGE)
          expectNoSecretExposure(secrets, fields)
        } finally {
          harness.unmount()
          vi.unstubAllGlobals()
        }
      }),
      { numRuns: 100 }
    )
  })
})


const MANDATORY_CHANGE_HEADING = "Cambio de contraseña obligatorio"
const NEW_PASSWORD_LABEL = "Nueva contraseña"
const CONFIRM_PASSWORD_LABEL = "Confirmar nueva contraseña"
const CHANGE_SUBMIT_LABEL = "Cambiar contraseña"
const VALID_NEW_PASSWORD = "nueva-password-123"

const AUTH_ENDPOINT = {
  LOGIN: "/api/v1/auth/login",
  CHANGE_PASSWORD: "/api/v1/auth/change-password",
} as const

// Único constructor de Resultado_de_Inicio_de_Sesión_Restringido: sin argumento
// usa el accessToken por defecto; con argumento inyecta el Secreto generado por
// las propiedades.
function createRestrictedLoginResponse(accessToken = "access-token"): Response {
  return createJsonResponse(200, {
    accessToken,
    refreshToken: "refresh-token",
    user: { id: "user-1" },
    passwordChangeRequired: true,
  })
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}

// Único mock de fetch que aísla y distingue las respuestas de
// /api/v1/auth/login y /api/v1/auth/change-password por URL. El manejador de
// cambio es opcional: sin él, cualquier solicitud resuelve con el login.
function mockAuthEndpoints(handlers: {
  login: () => Response
  changePassword?: () => Response
}) {
  return mockFetch((input) => {
    if (
      handlers.changePassword !== undefined &&
      resolveRequestUrl(input).includes(AUTH_ENDPOINT.CHANGE_PASSWORD)
    ) {
      return Promise.resolve(handlers.changePassword())
    }

    return Promise.resolve(handlers.login())
  })
}

describe("LoginForm en modo de cambio obligatorio", () => {
  it("monta el formulario de cambio obligatorio y retira el formulario de login tras un 200 con passwordChangeRequired", async () => {
    // Requisito 1.1: un Resultado_de_Inicio_de_Sesión_Restringido presenta el
    // Formulario_de_Cambio_de_Contraseña con título, etiquetas visibles y envío.
    const fetchMock = mockAuthEndpoints({ login: createRestrictedLoginResponse })
    const user = userEvent.setup()

    render(<LoginForm />)

    await fillValidCredentials(user)
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(
      await screen.findByRole("heading", { name: MANDATORY_CHANGE_HEADING })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(NEW_PASSWORD_LABEL)).toBeInTheDocument()
    expect(screen.getByLabelText(CONFIRM_PASSWORD_LABEL)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: CHANGE_SUBMIT_LABEL })).toBeInTheDocument()

    // El formulario de login deja de mostrarse al activarse el modo restringido.
    expect(screen.queryByLabelText("Cédula")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).not.toBeInTheDocument()
  })

  it("mantiene la sesión no disponible sin restaurar el formulario de login mientras el modo restringido está activo", async () => {
    // Requisito 1.4: mientras el Modo_de_Cambio_Obligatorio esté activo, la
    // Sesión_Autenticada_Disponible permanece sin habilitar y sin restaurar.
    const fetchMock = mockAuthEndpoints({ login: createRestrictedLoginResponse })
    const user = userEvent.setup()

    render(<LoginForm />)

    await fillValidCredentials(user)
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await screen.findByRole("heading", { name: MANDATORY_CHANGE_HEADING })

    // No se habilita ni restaura ningún flujo autenticado: solo persiste el
    // formulario de cambio obligatorio, nunca el formulario de login.
    expect(screen.queryByRole("button", { name: "Iniciar sesión" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Cédula")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: CHANGE_SUBMIT_LABEL })).toBeInTheDocument()
  })

  it("vuelve al formulario de login y exige una autenticación nueva tras un cambio exitoso", async () => {
    // Requisitos 4.3 y 4.4: tras una Respuesta_de_Cambio 200 { success: true } se
    // muestra el login existente, la sesión sigue no disponible y ningún inicio
    // posterior reutiliza la Contraseña_Actualizada.
    const fetchMock = mockAuthEndpoints({
      login: createRestrictedLoginResponse,
      changePassword: () => createJsonResponse(200, { success: true }),
    })
    const user = userEvent.setup()

    render(<LoginForm />)

    await fillValidCredentials(user)
    await user.click(screen.getByRole("button", { name: "Iniciar sesión" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await screen.findByRole("heading", { name: MANDATORY_CHANGE_HEADING })

    await user.type(screen.getByLabelText(NEW_PASSWORD_LABEL), VALID_NEW_PASSWORD)
    await user.type(screen.getByLabelText(CONFIRM_PASSWORD_LABEL), VALID_NEW_PASSWORD)
    await user.click(screen.getByRole("button", { name: CHANGE_SUBMIT_LABEL }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

    const cedula = await screen.findByLabelText("Cédula")
    const password = screen.getByLabelText("Contraseña")

    expect(cedula).toBeInTheDocument()
    expect(password).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Iniciar sesión" })).toBeInTheDocument()

    // El modo de cambio obligatorio se desactiva y no reaparece.
    expect(
      screen.queryByRole("heading", { name: MANDATORY_CHANGE_HEADING })
    ).not.toBeInTheDocument()

    // Autenticación nueva estándar: la Contraseña_Actualizada no se reutiliza.
    expect(cedula).not.toHaveValue(VALID_NEW_PASSWORD)
    expect(password).not.toHaveValue(VALID_NEW_PASSWORD)
  })
})


interface PropertyTransitionFixture {
  credentials: RestrictedSessionCredentials
  accessToken: string
  newPassword: string
  terminal: { status: number; body: Record<string, unknown> }
}

interface PropertyTransitionSecrets {
  accessToken: string
  newPassword: string
}

// Terminal Respuestas_de_Cambio that force a return to the login form: an exact
// 200 { success: true } and any 401. Both must drop the restricted mode, keep
// the Sesión_Autenticada_Disponible disabled and wipe every Secreto (Req 4.1,
// 4.2, 4.3, 4.4, 4.5, 4.6).
const propertyTransitionFixtures = fc.record({
  credentials: restrictedCredentialsArbitrary,
  accessToken: prefixedSecretArbitrary("access"),
  newPassword: alphanumericString({ minLength: 8, maxLength: 24 }),
  terminal: fc.constantFrom<{ status: number; body: Record<string, unknown> }>(
    { status: 200, body: { success: true } },
    { status: 401, body: {} }
  ),
})

interface PropertyTransitionHarness {
  submitLogin: (response: Response) => Promise<void>
  submitChange: (newPassword: string, response: Response) => Promise<void>
  unmount: () => void
}

function renderPropertyTransition(
  credentials: RestrictedSessionCredentials
): PropertyTransitionHarness {
  const pendingLogin: Array<(response: Response) => void> = []
  const pendingChange: Array<(response: Response) => void> = []
  mockFetch(
    (input) =>
      new Promise<Response>((resolve) => {
        if (resolveRequestUrl(input).includes(AUTH_ENDPOINT.CHANGE_PASSWORD)) {
          pendingChange.push(resolve)
        } else {
          pendingLogin.push(resolve)
        }
      })
  )
  const { unmount } = render(<LoginForm />)
  const cedula = screen.getByLabelText("Cédula")
  const password = screen.getByLabelText("Contraseña")
  const loginForm = getForm()

  fireEvent.change(cedula, { target: { value: credentials.cedula } })
  fireEvent.change(password, { target: { value: credentials.password } })

  return {
    unmount,
    async submitLogin(response) {
      fireEvent.submit(loginForm)

      const resolveResponse = pendingLogin.shift()

      if (resolveResponse === undefined) {
        throw new Error("Expected a pending login response.")
      }

      await act(async () => {
        resolveResponse(response)
      })
    },
    async submitChange(newPassword, response) {
      const newPasswordInput = screen.getByLabelText(NEW_PASSWORD_LABEL)
      const confirmPasswordInput = screen.getByLabelText(CONFIRM_PASSWORD_LABEL)
      const changeForm = newPasswordInput.closest("form")

      if (changeForm === null) {
        throw new Error("PasswordChangeForm must render a form element.")
      }

      fireEvent.change(newPasswordInput, { target: { value: newPassword } })
      fireEvent.change(confirmPasswordInput, { target: { value: newPassword } })
      fireEvent.submit(changeForm)

      const resolveResponse = pendingChange.shift()

      if (resolveResponse === undefined) {
        throw new Error("Expected a pending change-password response.")
      }

      await act(async () => {
        resolveResponse(response)
      })
    },
  }
}

function expectNoTransitionSecretExposure(secrets: PropertyTransitionSecrets) {
  const renderedDom = document.body.innerHTML
  const currentUrl = window.location.href
  const storageDump = JSON.stringify({
    local: { ...window.localStorage },
    session: { ...window.sessionStorage },
  })
  const inputValues = Array.from(
    document.querySelectorAll<HTMLInputElement>("input"),
    (input) => input.value
  )

  for (const secret of [secrets.accessToken, secrets.newPassword]) {
    expect(renderedDom).not.toContain(secret)
    expect(currentUrl).not.toContain(secret)
    expect(storageDump).not.toContain(secret)
    expect(inputValues).not.toContain(secret)
  }
}

describe("Propiedad 2", () => {
  it("vuelve al login, desactiva el modo restringido y no filtra secretos en resultados terminales", async () => {
    // Feature: cambio-obligatorio-contrasena, Property 2: Transición correcta de modo restringido a login
    await fc.assert(
      fc.asyncProperty(
        propertyTransitionFixtures,
        async (fixture: PropertyTransitionFixture) => {
          const { credentials, accessToken, newPassword, terminal } = fixture
          const secrets: PropertyTransitionSecrets = { accessToken, newPassword }
          const harness = renderPropertyTransition(credentials)

          try {
            await harness.submitLogin(createRestrictedLoginResponse(accessToken))

            // El modo restringido monta el formulario de cambio obligatorio.
            expect(
              screen.getByRole("heading", { name: MANDATORY_CHANGE_HEADING })
            ).toBeInTheDocument()
            expectNoTransitionSecretExposure(secrets)

            await harness.submitChange(
              newPassword,
              createJsonResponse(terminal.status, terminal.body)
            )

            // Resultado terminal: se retorna al formulario de login existente.
            expect(screen.getByLabelText("Cédula")).toBeInTheDocument()
            expect(screen.getByLabelText("Contraseña")).toBeInTheDocument()
            expect(
              screen.getByRole("button", { name: "Iniciar sesión" })
            ).toBeInTheDocument()

            // El modo de cambio obligatorio queda desactivado y sin reaparecer.
            expect(
              screen.queryByRole("heading", { name: MANDATORY_CHANGE_HEADING })
            ).not.toBeInTheDocument()
            expect(screen.queryByLabelText(NEW_PASSWORD_LABEL)).not.toBeInTheDocument()
            expect(
              screen.queryByLabelText(CONFIRM_PASSWORD_LABEL)
            ).not.toBeInTheDocument()

            // La Sesión_Autenticada_Disponible sigue sin habilitar: solo persiste
            // el formulario de login, nunca un panel autenticado.
            expect(
              screen.queryByRole("button", { name: CHANGE_SUBMIT_LABEL })
            ).not.toBeInTheDocument()

            // Ningún Secreto (accessToken ni contraseña nueva) queda expuesto en
            // DOM, URL, almacenamiento ni entradas tras la transición.
            expect(screen.getByLabelText("Contraseña")).not.toHaveValue(newPassword)
            expectNoTransitionSecretExposure(secrets)
          } finally {
            harness.unmount()
            vi.unstubAllGlobals()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
