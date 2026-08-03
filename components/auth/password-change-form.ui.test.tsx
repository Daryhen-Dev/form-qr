import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import fc from "fast-check"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PASSWORD_CHANGE_STATUS_MESSAGE,
  PASSWORD_CHANGE_VALIDATION,
} from "@/lib/auth/password-change-ui"

import { PasswordChangeForm } from "./password-change-form"

const PASSWORD_FIXTURE = {
  SHORT: "corta",
  VALID: "contraseña-segura",
  DIFFERENT: "otra-contraseña",
} as const

type FetchMock = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

// Centralized fetch stubbing so every interaction test isolates the global
// fetch through the same helpers and shares the cleanup in afterEach.
function stubFetch(implementation?: FetchMock) {
  const fetchMock = implementation
    ? vi.fn<FetchMock>(implementation)
    : vi.fn<FetchMock>()

  vi.stubGlobal("fetch", fetchMock)

  return fetchMock
}

function stubPendingFetch() {
  return stubFetch(() => new Promise<Response>(() => undefined))
}

interface DeferredFetch {
  fetchMock: ReturnType<typeof stubFetch>
  resolveNext: (response: Response) => void
}

// Fetch stub that defers each response so a test can assert the pending state
// before resolving the terminal Respuesta_de_Cambio. Reuses the shared FetchMock
// contract instead of re-declaring the mock signature per test.
function stubDeferredFetch(): DeferredFetch {
  const pendingResponses: Array<(response: Response) => void> = []
  const fetchMock = stubFetch(
    () =>
      new Promise<Response>((resolve) => {
        pendingResponses.push(resolve)
      })
  )

  return {
    fetchMock,
    resolveNext(response) {
      const resolveResponse = pendingResponses.shift()

      if (resolveResponse === undefined) {
        throw new Error("Expected a pending change-password response.")
      }

      resolveResponse(response)
    },
  }
}

// ---------------------------------------------------------------------------
// Respuesta_de_Cambio fixtures (Req 4.1-4.9)
//
// Single source of truth for every change-password response shape the UI must
// handle: 200 (success / body mismatch), 401, 422 (with and without a
// newPassword issue), red (network rejection) and JSON inválido. Both the
// no-exposición property (Property 1) and the branch-by-branch interaction
// tests build their responses from here so the status/branch matrix lives in
// one place and never drifts between suites.
// ---------------------------------------------------------------------------

// Base JSON response builder shared by every terminal branch.
function createJsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// 200 whose body fails to decode, exercising the safe retryable path (Req 4.9).
function createInvalidJsonResponse(status = 200): Response {
  return new Response("<<not-json>>", {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// Every terminal Respuesta_de_Cambio branch built from the shared JSON builder.
// Each entry mirrors a row in the design's Error Handling table so the
// interaction tests exercise the full status/branch matrix from a single stub.
const CHANGE_RESPONSE = {
  success: () => createJsonResponse(200, { success: true }),
  successBodyMismatch: () => createJsonResponse(200, { success: false }),
  unauthorized: () => createJsonResponse(401, {}),
  validationNewPassword: () =>
    createJsonResponse(422, {
      issues: [{ path: ["newPassword"], message: "too weak" }],
    }),
  validationOther: () =>
    createJsonResponse(422, {
      issues: [{ path: ["confirmPassword"], message: "mismatch" }],
    }),
  invalidJson: () => createInvalidJsonResponse(),
} as const

// Fetch behavior for the red (network) branch: a rejected fetch that must
// degrade to the safe retryable message without leaking the error (Req 4.9).
const NETWORK_FAILURE_FETCH: FetchMock = () =>
  Promise.reject(new TypeError("Failed to fetch"))

function expectPasswordFieldComposition(labelText: string) {
  const input = screen.getByLabelText(labelText)
  const label = screen.getByText(labelText, { selector: "label" })

  expect(label).toHaveAttribute("data-slot", "label")
  expect(label).toHaveAttribute("for", input.id)
  expect(input).toHaveAttribute("data-slot", "input")
  expect(input).toHaveAccessibleName(labelText)
  expect(input).toHaveAttribute("type", "password")

  return input
}

function expectAccessibleFieldError(input: HTMLElement, message: string) {
  const error = screen.getByText(message)

  expect(input).toHaveAttribute("aria-invalid", "true")
  expect(input).toHaveAccessibleDescription(message)
  expect(error).toHaveAttribute("role", "alert")
  expect(error).toHaveAttribute("aria-live", "assertive")
}

function getForm() {
  const form = screen
    .getByRole("heading", { name: "Cambio de contraseña obligatorio" })
    .closest("form")

  if (form === null) {
    throw new Error("PasswordChangeForm must render a form element.")
  }

  return form
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("PasswordChangeForm", () => {
  it("compone primitivas, etiqueta y enmascara las contraseñas, con foco inicial y navegación por Tab", async () => {
    const user = userEvent.setup()

    render(<PasswordChangeForm accessToken="restricted-token" onComplete={vi.fn()} />)

    const newPassword = expectPasswordFieldComposition("Nueva contraseña")
    const confirmPassword = expectPasswordFieldComposition("Confirmar nueva contraseña")
    const submitButton = screen.getByRole("button", { name: "Cambiar contraseña" })

    expect(
      screen.getByRole("heading", { name: "Cambio de contraseña obligatorio" })
    ).toBeVisible()
    expect(submitButton).toHaveAttribute("data-slot", "button")
    expect(submitButton).toHaveAttribute("type", "submit")
    expect(newPassword).toHaveFocus()

    await user.tab()
    expect(confirmPassword).toHaveFocus()

    await user.tab()
    expect(submitButton).toHaveFocus()

    await user.tab({ shift: true })
    expect(confirmPassword).toHaveFocus()
  })

  it("muestra el error de contraseña corta, lo anuncia y bloquea la solicitud localmente", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()

    render(<PasswordChangeForm accessToken="restricted-token" onComplete={vi.fn()} />)

    const newPassword = screen.getByLabelText("Nueva contraseña")
    const confirmPassword = screen.getByLabelText("Confirmar nueva contraseña")

    await user.type(newPassword, PASSWORD_FIXTURE.SHORT)
    await user.type(confirmPassword, PASSWORD_FIXTURE.SHORT)
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }))

    expectAccessibleFieldError(newPassword, PASSWORD_CHANGE_VALIDATION.MIN_LENGTH_ERROR)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("muestra y anuncia el error cuando la confirmación no coincide", async () => {
    const fetchMock = stubFetch()
    const user = userEvent.setup()

    render(<PasswordChangeForm accessToken="restricted-token" onComplete={vi.fn()} />)

    const newPassword = screen.getByLabelText("Nueva contraseña")
    const confirmPassword = screen.getByLabelText("Confirmar nueva contraseña")

    await user.type(newPassword, PASSWORD_FIXTURE.VALID)
    await user.type(confirmPassword, PASSWORD_FIXTURE.DIFFERENT)
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }))

    expectAccessibleFieldError(confirmPassword, PASSWORD_CHANGE_VALIDATION.MISMATCH_ERROR)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("lleva el foco a la primera entrada con error en el orden visual", async () => {
    const user = userEvent.setup()

    render(<PasswordChangeForm accessToken="restricted-token" onComplete={vi.fn()} />)

    const newPassword = screen.getByLabelText("Nueva contraseña")
    const confirmPassword = screen.getByLabelText("Confirmar nueva contraseña")

    await user.type(newPassword, PASSWORD_FIXTURE.SHORT)
    await user.type(confirmPassword, PASSWORD_FIXTURE.DIFFERENT)
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }))

    expectAccessibleFieldError(newPassword, PASSWORD_CHANGE_VALIDATION.MIN_LENGTH_ERROR)
    expectAccessibleFieldError(confirmPassword, PASSWORD_CHANGE_VALIDATION.MISMATCH_ERROR)
    expect(newPassword).toHaveFocus()
  })

  it("bloquea el envío pendiente y anuncia su progreso en una región de estado accesible", async () => {
    const fetchMock = stubPendingFetch()
    const user = userEvent.setup()

    render(<PasswordChangeForm accessToken="restricted-token" onComplete={vi.fn()} />)

    await user.type(screen.getByLabelText("Nueva contraseña"), PASSWORD_FIXTURE.VALID)
    await user.type(screen.getByLabelText("Confirmar nueva contraseña"), PASSWORD_FIXTURE.VALID)
    await user.click(screen.getByRole("button", { name: "Cambiar contraseña" }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(getForm()).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: PASSWORD_CHANGE_STATUS_MESSAGE.IN_PROGRESS })).toBeDisabled()
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite")
    expect(screen.getByRole("status")).toHaveTextContent(PASSWORD_CHANGE_STATUS_MESSAGE.IN_PROGRESS)
  })
})

const ALPHANUMERIC_CHARACTERS = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
]

// Shared alphanumeric string arbitrary. Every Secreto and Contraseña generated in
// this suite lives in the same character space, so length bounds are the only
// thing that varies between the secret and activation generators.
function alphanumericString(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...ALPHANUMERIC_CHARACTERS), { minLength, maxLength })
    .map((characters) => characters.join(""))
}

// Shared Secreto arbitrary: both the Token_de_Acceso and the Contraseña_Nueva
// are 8-24 character alphanumeric strings, optionally namespaced by a prefix.
// Consolidating the generator keeps every secret in the same input space so the
// no-exposure invariant is exercised uniformly (Req 4.1, 4.2, 4.6).
function secretArbitrary(prefix = "") {
  return alphanumericString(8, 24).map((value) => `${prefix}${value}`)
}

// Terminal responses where every secret must be removed: 200 { success: true }
// clears secrets and leaves the restricted mode (Req 4.1, 4.2); 401 clears
// secrets and returns to login (Req 4.6). Both mandate secret removal, so the
// no-exposure invariant (Req 4.11) is asserted after each interaction.
type SecretOutcome = "success" | "unauthorized"

interface SecretExposureFixture {
  accessToken: string
  newPassword: string
  outcome: SecretOutcome
}

const secretExposureFixtures = fc.record({
  accessToken: secretArbitrary("access_"),
  newPassword: secretArbitrary(),
  outcome: fc.constantFrom<SecretOutcome>("success", "unauthorized"),
})

// Every Secreto that must never leak after an interaction (Req 4.1, 4.2, 4.6).
function collectSecrets(fixture: SecretExposureFixture): string[] {
  return [fixture.accessToken, fixture.newPassword]
}

// Reuse the consolidated Respuesta_de_Cambio fixtures so Property 1 exercises
// the exact same 200/401 bodies as the interaction tests (Req 4.1, 4.2, 4.6).
function createChangeResponse(outcome: SecretOutcome): Response {
  return outcome === "success"
    ? CHANGE_RESPONSE.success()
    : CHANGE_RESPONSE.unauthorized()
}

function readStorageEntries(storage: Storage): string[] {
  const entries: string[] = []

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)

    if (key !== null) {
      entries.push(key)
      entries.push(storage.getItem(key) ?? "")
    }
  }

  return entries
}

// Property 1 verifies that no Secreto reaches any observable channel after an
// interaction: rendered DOM, URL, browser storage, status/error messages, and
// the values still held by the inputs once secrets must be cleared.
function expectNoSecretExposure(secrets: string[]) {
  const renderedDom = document.body.innerHTML
  const currentUrl = window.location.href
  const statusMessage = screen.queryByRole("status")?.textContent ?? ""
  const fieldErrors = screen
    .queryAllByRole("alert")
    .map((alert) => alert.textContent ?? "")
    .join("\n")
  const inputValues = Array.from(
    document.querySelectorAll<HTMLInputElement>("input"),
    (input) => input.value
  )
  const storageEntries = [
    ...readStorageEntries(window.localStorage),
    ...readStorageEntries(window.sessionStorage),
  ]

  for (const secret of secrets) {
    expect(renderedDom).not.toContain(secret)
    expect(currentUrl).not.toContain(secret)
    expect(statusMessage).not.toContain(secret)
    expect(fieldErrors).not.toContain(secret)
    expect(inputValues).not.toContain(secret)

    for (const entry of storageEntries) {
      expect(entry).not.toContain(secret)
    }
  }
}

interface SecretExposureHarness {
  submit: (response: Response) => Promise<void>
  unmount: () => void
}

function renderSecretExposureHarness(
  fixture: SecretExposureFixture
): SecretExposureHarness {
  const deferredFetch = stubDeferredFetch()

  const { unmount } = render(
    <PasswordChangeForm accessToken={fixture.accessToken} onComplete={vi.fn()} />
  )
  const newPassword = screen.getByLabelText("Nueva contraseña")
  const confirmPassword = screen.getByLabelText("Confirmar nueva contraseña")
  const form = getForm()

  fireEvent.change(newPassword, { target: { value: fixture.newPassword } })
  fireEvent.change(confirmPassword, { target: { value: fixture.newPassword } })

  return {
    unmount,
    async submit(response) {
      fireEvent.submit(form)
      expect(deferredFetch.fetchMock).toHaveBeenCalledTimes(1)

      await act(async () => {
        deferredFetch.resolveNext(response)
      })
    },
  }
}

describe("Propiedad 1", () => {
  it("no expone secretos en DOM, URL, almacenamiento ni mensajes tras interactuar", async () => {
    // Feature: cambio-obligatorio-contrasena, Property 1: No-exposición de secretos
    await fc.assert(
      fc.asyncProperty(
        secretExposureFixtures,
        async (fixture: SecretExposureFixture) => {
          const secrets = collectSecrets(fixture)
          const harness = renderSecretExposureHarness(fixture)

          try {
            await harness.submit(createChangeResponse(fixture.outcome))

            expectNoSecretExposure(secrets)
          } finally {
            harness.unmount()
            vi.unstubAllGlobals()
            window.localStorage.clear()
            window.sessionStorage.clear()
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})

interface ResponseHarness {
  onComplete: ReturnType<typeof vi.fn>
  fetchMock: ReturnType<typeof stubFetch>
  submit: () => Promise<void>
  newPassword: HTMLElement
  confirmPassword: HTMLElement
}

// Render the form with matching valid passwords already entered, stub fetch
// with the branch under test, and expose a submit helper that waits for the
// single Solicitud_de_Cambio to fire before assertions run.
function renderResponseHarness(fetchImpl: FetchMock): ResponseHarness {
  const onComplete = vi.fn()
  const fetchMock = stubFetch(fetchImpl)

  render(<PasswordChangeForm accessToken="restricted-token" onComplete={onComplete} />)

  const newPassword = screen.getByLabelText("Nueva contraseña")
  const confirmPassword = screen.getByLabelText("Confirmar nueva contraseña")

  fireEvent.change(newPassword, { target: { value: PASSWORD_FIXTURE.VALID } })
  fireEvent.change(confirmPassword, { target: { value: PASSWORD_FIXTURE.VALID } })

  return {
    onComplete,
    fetchMock,
    newPassword,
    confirmPassword,
    async submit() {
      fireEvent.submit(getForm())
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    },
  }
}

function expectRetryEnabled() {
  const retryButton = screen.getByRole("button", { name: "Cambiar contraseña" })

  expect(retryButton).toBeEnabled()
  expect(getForm()).not.toHaveAttribute("aria-busy", "true")
}

describe("PasswordChangeForm manejo de Respuesta_de_Cambio", () => {
  it("200 con { success: true } completa el cambio, anuncia el éxito y limpia los secretos", async () => {
    // Req 4.1, 4.2, 4.3, 4.4, 4.5
    const harness = renderResponseHarness(async () => CHANGE_RESPONSE.success())

    await harness.submit()

    expect(
      await screen.findByText(PASSWORD_CHANGE_STATUS_MESSAGE.SUCCESS_LOGIN_REQUIRED)
    ).toBeVisible()
    await waitFor(() => expect(harness.onComplete).toHaveBeenCalledTimes(1))
    expect(harness.newPassword).toHaveValue("")
    expect(harness.confirmPassword).toHaveValue("")
  })

  it("200 con cuerpo distinto de { success: true } permite reintento sin completar", async () => {
    // Req 4.9
    const harness = renderResponseHarness(async () => CHANGE_RESPONSE.successBodyMismatch())

    await harness.submit()

    expect(
      await screen.findByText(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
    ).toBeVisible()
    expect(harness.onComplete).not.toHaveBeenCalled()
    expectRetryEnabled()
  })

  it("401 regresa al inicio de sesión, anuncia nuevo login y elimina los secretos", async () => {
    // Req 4.6
    const harness = renderResponseHarness(async () => CHANGE_RESPONSE.unauthorized())

    await harness.submit()

    expect(
      await screen.findByText(PASSWORD_CHANGE_STATUS_MESSAGE.NEW_LOGIN_REQUIRED)
    ).toBeVisible()
    await waitFor(() => expect(harness.onComplete).toHaveBeenCalledTimes(1))
    expect(harness.newPassword).toHaveValue("")
    expect(harness.confirmPassword).toHaveValue("")
  })

  it("422 con issue newPassword muestra el error de campo localizado y permite reintento", async () => {
    // Req 4.7
    const harness = renderResponseHarness(async () => CHANGE_RESPONSE.validationNewPassword())

    await harness.submit()

    await waitFor(() =>
      expect(screen.getByText(PASSWORD_CHANGE_STATUS_MESSAGE.VALIDATION_ERROR)).toBeVisible()
    )
    expectAccessibleFieldError(
      screen.getByLabelText("Nueva contraseña"),
      PASSWORD_CHANGE_STATUS_MESSAGE.VALIDATION_ERROR
    )
    expect(harness.onComplete).not.toHaveBeenCalled()
    expectRetryEnabled()
  })

  it("422 sin issue newPassword comunica el mensaje reintentable seguro", async () => {
    // Req 4.8
    const harness = renderResponseHarness(async () => CHANGE_RESPONSE.validationOther())

    await harness.submit()

    expect(
      await screen.findByText(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
    ).toBeVisible()
    expect(harness.onComplete).not.toHaveBeenCalled()
    expectRetryEnabled()
  })

  it("falla de red comunica el mensaje reintentable seguro y permite reintento", async () => {
    // Req 4.9
    const harness = renderResponseHarness(NETWORK_FAILURE_FETCH)

    await harness.submit()

    expect(
      await screen.findByText(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
    ).toBeVisible()
    expect(harness.onComplete).not.toHaveBeenCalled()
    expectRetryEnabled()
  })

  it("JSON inválido comunica el mensaje reintentable seguro y permite reintento", async () => {
    // Req 4.9
    const harness = renderResponseHarness(async () => CHANGE_RESPONSE.invalidJson())

    await harness.submit()

    expect(
      await screen.findByText(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
    ).toBeVisible()
    expect(harness.onComplete).not.toHaveBeenCalled()
    expectRetryEnabled()
  })
})

// ---------------------------------------------------------------------------
// Property 4: Equivalencia de interacción teclado/puntero (Req 5.1, 5.2, 5.3)
//
// Activar el control de envío con clic del puntero, con Enter (envío implícito
// desde una entrada de texto) o con Espacio (activación del botón enfocado)
// debe producir el mismo resultado observable para los mismos valores de
// entrada: idéntica validación (mismos Error_de_Campo), idéntico Mensaje_de_Estado
// y la misma Solicitud_de_Cambio (o su ausencia cuando la validación local la
// bloquea). Se generan contraseñas válidas e inválidas, coincidentes y no
// coincidentes, para cubrir las ramas de envío y de error.
// ---------------------------------------------------------------------------

const ACTIVATION_ACCESS_TOKEN = "restricted-activation-token"

type SubmitActivation = "click" | "enter" | "space"

interface ActivationFixture {
  newPassword: string
  confirmPassword: string
}

// Contraseñas válidas (>= longitud mínima) y cortas (< longitud mínima) para
// ejercitar tanto el envío autenticado como el Error_de_Campo local.
const validActivationPassword = alphanumericString(PASSWORD_CHANGE_VALIDATION.MIN_LENGTH, 24)

const shortActivationPassword = alphanumericString(0, PASSWORD_CHANGE_VALIDATION.MIN_LENGTH - 1)

const activationPassword = fc.oneof(
  { weight: 3, arbitrary: validActivationPassword },
  { weight: 1, arbitrary: shortActivationPassword }
)

// Sesga la confirmación hacia la coincidencia exacta para cubrir la rama de
// envío exitoso, sin dejar de generar confirmaciones distintas que disparan el
// Error_de_Campo de coincidencia.
const activationFixtures: fc.Arbitrary<ActivationFixture> = activationPassword.chain(
  (newPassword) =>
    fc.record({
      newPassword: fc.constant(newPassword),
      confirmPassword: fc.oneof(
        { weight: 2, arbitrary: fc.constant(newPassword) },
        { weight: 1, arbitrary: activationPassword }
      ),
    })
)

// Resultado observable tras una activación: la Solicitud_de_Cambio emitida (o su
// ausencia), los Error_de_Campo de ambas entradas y el Mensaje_de_Estado.
interface ActivationSnapshot {
  request: { url: string; init: RequestInit | undefined } | null
  newPasswordError: string | null
  confirmPasswordError: string | null
  statusMessage: string | null
}

// Lee el Error_de_Campo asociado programáticamente a una entrada mediante
// aria-invalid + aria-describedby, tal como lo percibe la Tecnología_de_Asistencia.
function readFieldError(labelText: string): string | null {
  const input = screen.getByLabelText(labelText)

  if (input.getAttribute("aria-invalid") !== "true") {
    return null
  }

  const describedBy = input.getAttribute("aria-describedby")

  if (describedBy === null) {
    return null
  }

  return document.getElementById(describedBy)?.textContent ?? null
}

function readActivationSnapshot(
  fetchMock: ReturnType<typeof stubFetch>
): ActivationSnapshot {
  const [firstCall] = fetchMock.mock.calls

  return {
    request: firstCall ? { url: String(firstCall[0]), init: firstCall[1] } : null,
    newPasswordError: readFieldError("Nueva contraseña"),
    confirmPasswordError: readFieldError("Confirmar nueva contraseña"),
    statusMessage: screen.queryByRole("status")?.textContent ?? null,
  }
}

interface ActivationControls {
  newPassword: HTMLElement
  submitButton: HTMLElement
}

type ActivationGesture = (
  user: ReturnType<typeof userEvent.setup>,
  controls: ActivationControls
) => Promise<void>

// Cada gesto de activación (clic/Enter/Espacio) vive en una única tabla, de modo
// que la propiedad recorra el mismo conjunto de activaciones sin ramificar la
// lógica de disparo. El orden de inserción fija el clic como referencia.
const SUBMIT_ACTIVATIONS: Record<SubmitActivation, ActivationGesture> = {
  async click(user, controls) {
    await user.click(controls.submitButton)
  },
  async enter(user, controls) {
    // Envío implícito: Enter dentro de una entrada de texto enfocada envía el
    // formulario igual que activar el control de envío.
    controls.newPassword.focus()
    await user.keyboard("{Enter}")
  },
  async space(user, controls) {
    // Espacio activa el botón de envío enfocado en el keyup, reflejando un clic
    // de puntero.
    controls.submitButton.focus()
    await user.keyboard("[Space]")
  },
}

const SUBMIT_ACTIVATION_ORDER = Object.keys(SUBMIT_ACTIVATIONS) as SubmitActivation[]

// La Solicitud_de_Cambio queda pendiente para que el estado en proceso sea
// determinista sin resolver la respuesta; solo interesa la equivalencia entre
// activaciones, no el manejo posterior de la Respuesta_de_Cambio.
async function runSubmitActivation(
  fixture: ActivationFixture,
  activation: SubmitActivation
): Promise<ActivationSnapshot> {
  const fetchMock = stubPendingFetch()
  const user = userEvent.setup({ delay: null })
  const { unmount } = render(
    <PasswordChangeForm accessToken={ACTIVATION_ACCESS_TOKEN} onComplete={vi.fn()} />
  )

  try {
    const newPassword = screen.getByLabelText("Nueva contraseña")
    const confirmPassword = screen.getByLabelText("Confirmar nueva contraseña")
    const submitButton = screen.getByRole("button", { name: "Cambiar contraseña" })

    // Los valores se fijan de una vez: la propiedad prueba la equivalencia del
    // gesto de activación (clic/Enter/Espacio), no el tecleo carácter a carácter.
    fireEvent.change(newPassword, { target: { value: fixture.newPassword } })
    fireEvent.change(confirmPassword, { target: { value: fixture.confirmPassword } })

    await SUBMIT_ACTIVATIONS[activation](user, { newPassword, submitButton })

    return readActivationSnapshot(fetchMock)
  } finally {
    unmount()
    vi.unstubAllGlobals()
  }
}

describe("Propiedad 4", () => {
  it("produce validación, mensajes y solicitud idénticos al activar con clic, Enter o Espacio", async () => {
    // Feature: cambio-obligatorio-contrasena, Property 4: Equivalencia de interacción teclado/puntero
    await fc.assert(
      fc.asyncProperty(activationFixtures, async (fixture: ActivationFixture) => {
        // Las activaciones se ejecutan en serie (comparten el mismo document.body)
        // y la primera del orden, el clic, actúa como referencia observable.
        const snapshots: ActivationSnapshot[] = []

        for (const activation of SUBMIT_ACTIVATION_ORDER) {
          snapshots.push(await runSubmitActivation(fixture, activation))
        }

        const [baselineSnapshot, ...alternativeSnapshots] = snapshots

        for (const snapshot of alternativeSnapshots) {
          expect(snapshot).toEqual(baselineSnapshot)
        }
      }),
      { numRuns: 100 }
    )
  }, 30000)
})
