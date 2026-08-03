"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"

import {
  createAccessContext,
  useOptionalAccess,
} from "@/components/access/access-provider"
import { PasswordChangeForm } from "@/components/auth/password-change-form"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  LOGIN_FIELD,
  SESSION_AVAILABILITY,
  buildLoginRequest,
  canSubmit,
  deriveSessionState,
  type FieldErrors,
  type LoginField,
  type LoginFormState,
  type SessionState,
  translate422FieldErrors,
  updateLoginField,
  validateCedula,
  validatePassword,
} from "@/lib/auth/login-ui"

const INITIAL_FORM_STATE: LoginFormState = {
  credentials: { cedula: "", password: "" },
  fieldErrors: {},
}

const LOGIN_STATUS_MESSAGE = {
  INVALID_CREDENTIALS: "No fue posible iniciar sesión. Verifique sus credenciales e inténtelo nuevamente.",
  PASSWORD_CHANGE_REQUIRED: "Debe cambiar su contraseña antes de acceder a la aplicación.",
  REVIEW_FIELDS: "Revise los campos indicados.",
  RETRYABLE_FAILURE: "No fue posible iniciar sesión. Inténtelo nuevamente.",
} as const

export function LoginForm() {
  const accessProvider = useOptionalAccess()
  const [formState, setFormState] = useState(INITIAL_FORM_STATE)
  const [isPending, setIsPending] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>()
  const [restrictedSession, setRestrictedSession] = useState<SessionState>()
  const formRef = useRef<HTMLFormElement>(null)
  const cedulaInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const { credentials, fieldErrors } = formState

  useEffect(() => {
    formRef.current?.setAttribute("data-hydrated", "true")
  }, [])

  function handleRestrictedComplete(message?: string) {
    accessProvider?.clearAccess()
    setRestrictedSession(undefined)
    setStatusMessage(message)
    setFormState(INITIAL_FORM_STATE)
    setIsPending(false)
  }

  function handleFieldChange(field: LoginField, value: string) {
    setFormState((current) => {
      if (current.fieldErrors[field] === undefined) {
        return {
          credentials: { ...current.credentials, [field]: value },
          fieldErrors: current.fieldErrors,
        }
      }

      return updateLoginField(current, field, value)
    })
  }

  function resetAccess() {
    accessProvider?.clearAccess()
    setRestrictedSession(undefined)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isPending) {
      return
    }

    const cedulaError = validateCedula(credentials.cedula)
    const passwordError = validatePassword(credentials.password)
    const nextFieldErrors: FieldErrors = {}

    if (cedulaError !== undefined) {
      nextFieldErrors.cedula = cedulaError
    }
    if (passwordError !== undefined) {
      nextFieldErrors.password = passwordError
    }

    setStatusMessage(undefined)
    setFormState((current) => ({ ...current, fieldErrors: nextFieldErrors }))

    if (!canSubmit(nextFieldErrors)) {
      if (cedulaError !== undefined) {
        cedulaInputRef.current?.focus()
      } else {
        passwordInputRef.current?.focus()
      }

      return
    }

    setIsPending(true)

    try {
      const response = await fetch("/api/v1/auth/login", buildLoginRequest(credentials))

      if (response.status === 200) {
        const session = deriveSessionState(await response.json())

        if (session === undefined) {
          resetAccess()
          setStatusMessage(LOGIN_STATUS_MESSAGE.RETRYABLE_FAILURE)
        } else {
          const access = createAccessContext({
            accessToken: session.accessToken,
            user: session.user,
            availability: session.availability,
          })

          if (accessProvider !== undefined && access === undefined) {
            resetAccess()
            setStatusMessage(LOGIN_STATUS_MESSAGE.RETRYABLE_FAILURE)
          } else if (session.availability === SESSION_AVAILABILITY.RESTRICTED) {
            if (accessProvider !== undefined && access !== undefined) {
              accessProvider.setAccess(access)
            } else {
              setRestrictedSession(session)
            }
            setStatusMessage(LOGIN_STATUS_MESSAGE.PASSWORD_CHANGE_REQUIRED)
          } else if (accessProvider !== undefined && access !== undefined) {
            accessProvider.setAccess(access)
          }
        }

        return
      }

      if (response.status === 401) {
        resetAccess()
        setFormState((current) => ({
          ...current,
          credentials: { ...current.credentials, password: "" },
        }))
        setStatusMessage(LOGIN_STATUS_MESSAGE.INVALID_CREDENTIALS)

        return
      }

      if (response.status === 422) {
        resetAccess()
        setFormState((current) => ({
          ...current,
          credentials: { ...current.credentials, password: "" },
        }))

        try {
          const responseFieldErrors = translate422FieldErrors(await response.json())

          setFormState((current) => ({
            ...current,
            fieldErrors: responseFieldErrors,
          }))
          setStatusMessage(
            Object.keys(responseFieldErrors).length > 0
              ? LOGIN_STATUS_MESSAGE.REVIEW_FIELDS
              : LOGIN_STATUS_MESSAGE.RETRYABLE_FAILURE
          )
        } catch {
          setStatusMessage(LOGIN_STATUS_MESSAGE.RETRYABLE_FAILURE)
        }

        return
      }

      resetAccess()
      setStatusMessage(LOGIN_STATUS_MESSAGE.RETRYABLE_FAILURE)
    } catch {
      resetAccess()
      setStatusMessage(LOGIN_STATUS_MESSAGE.RETRYABLE_FAILURE)
    } finally {
      setIsPending(false)
    }
  }

  const isRestricted = restrictedSession !== undefined

  return (
    <>
      <form
        aria-busy={isPending}
        className="w-full space-y-5"
        noValidate
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {isRestricted ? (
          <Alert aria-atomic="true" aria-live="polite" role="status" variant="destructive">
            {LOGIN_STATUS_MESSAGE.PASSWORD_CHANGE_REQUIRED}
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="login-cedula">Cédula</Label>
              <Input
                aria-describedby={fieldErrors.cedula ? "login-cedula-error" : undefined}
                aria-invalid={fieldErrors.cedula ? true : undefined}
                autoComplete="username"
                className="h-11"
                id="login-cedula"
                inputMode="numeric"
                name={LOGIN_FIELD.CEDULA}
                onChange={(event) => handleFieldChange(LOGIN_FIELD.CEDULA, event.target.value)}
                ref={cedulaInputRef}
                value={credentials.cedula}
              />
              {fieldErrors.cedula ? (
                <Alert aria-live="assertive" id="login-cedula-error" variant="destructive">
                  {fieldErrors.cedula}
                </Alert>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Contraseña</Label>
              <Input
                aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                aria-invalid={fieldErrors.password ? true : undefined}
                autoComplete="current-password"
                className="h-11"
                id="login-password"
                name={LOGIN_FIELD.PASSWORD}
                onChange={(event) => handleFieldChange(LOGIN_FIELD.PASSWORD, event.target.value)}
                ref={passwordInputRef}
                type="password"
                value={credentials.password}
              />
              {fieldErrors.password ? (
                <Alert aria-live="assertive" id="login-password-error" variant="destructive">
                  {fieldErrors.password}
                </Alert>
              ) : null}
            </div>
            {statusMessage ? (
              <Alert aria-atomic="true" aria-live="polite" role="status" variant="destructive">
                {statusMessage}
              </Alert>
            ) : null}
            <Button className="h-11 w-full" disabled={isPending} type="submit">
              {isPending ? "Iniciando sesión…" : "Iniciar sesión"}
            </Button>
          </>
        )}
      </form>
      {isRestricted ? (
        <PasswordChangeForm
          accessToken={restrictedSession.accessToken}
          onComplete={handleRestrictedComplete}
        />
      ) : null}
    </>
  )
}
