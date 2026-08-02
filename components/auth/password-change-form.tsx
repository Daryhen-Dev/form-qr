"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"

import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  buildChangePasswordRequest,
  PASSWORD_CHANGE_FIELD,
  PASSWORD_CHANGE_STATUS_MESSAGE,
  type PasswordChangeFieldErrors,
  validateConfirmPassword,
  validateNewPassword,
} from "@/lib/auth/password-change-ui"

interface PasswordChangeFormProps {
  accessToken: string
  onComplete: (statusMessage?: string) => void
}

// Narrow the untyped Respuesta_de_Cambio body without trusting its shape. The
// payload is treated as `unknown` so a malformed 200 can never masquerade as a
// successful change (Req 4.9).
function isSuccessPayload(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as Record<string, unknown>).success === true
  )
}

// A 422 maps to the localized field error only when its issues explicitly point
// at `newPassword`; every other validation shape stays retryable (Req 4.7, 4.8).
function hasNewPasswordIssue(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) {
    return false
  }

  const issues = (payload as Record<string, unknown>).issues

  if (!Array.isArray(issues)) {
    return false
  }

  return issues.some((issue) => {
    if (typeof issue !== "object" || issue === null) {
      return false
    }

    const path = (issue as Record<string, unknown>).path

    return Array.isArray(path) && path[0] === PASSWORD_CHANGE_FIELD.NEW_PASSWORD
  })
}

export function PasswordChangeForm({
  accessToken,
  onComplete,
}: PasswordChangeFormProps) {
  const newPasswordInputRef = useRef<HTMLInputElement>(null)
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fieldErrors, setFieldErrors] = useState<PasswordChangeFieldErrors>({})
  const [statusMessage, setStatusMessage] = useState<string>()
  const [isPending, setIsPending] = useState(false)

  useEffect(() => {
    newPasswordInputRef.current?.focus()
  }, [])

  // Map a resolved Respuesta_de_Cambio to its terminal branch. JSON parsing is
  // wrapped so a body that fails to decode degrades to the safe retryable
  // message instead of rejecting (Req 4.9). The access token is never touched
  // here: on success/401 the parent's onComplete() drops the restricted session,
  // and every other branch keeps it in ephemeral props for a retry.
  async function handleResponse(response: Response) {
    if (response.status === 200) {
      let payload: unknown

      try {
        payload = await response.json()
      } catch {
        setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)

        return
      }

      if (isSuccessPayload(payload)) {
        setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.SUCCESS_LOGIN_REQUIRED)
        onComplete()
      } else {
        setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
      }

      return
    }

    if (response.status === 401) {
      // Surface the safe NEW_LOGIN_REQUIRED notice through onComplete so it
      // renders on the returned login form after this form unmounts (Req 4.6).
      // The local status keeps the isolated component behavior intact.
      setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.NEW_LOGIN_REQUIRED)
      onComplete(PASSWORD_CHANGE_STATUS_MESSAGE.NEW_LOGIN_REQUIRED)

      return
    }

    if (response.status === 422) {
      let payload: unknown

      try {
        payload = await response.json()
      } catch {
        setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)

        return
      }

      if (hasNewPasswordIssue(payload)) {
        setFieldErrors({
          [PASSWORD_CHANGE_FIELD.NEW_PASSWORD]:
            PASSWORD_CHANGE_STATUS_MESSAGE.VALIDATION_ERROR,
        })
      } else {
        setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
      }

      return
    }

    setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isPending) {
      return
    }

    const newPasswordError = validateNewPassword(newPassword)
    const confirmPasswordError = validateConfirmPassword(
      newPassword,
      confirmPassword
    )
    const nextFieldErrors: PasswordChangeFieldErrors = {
      [PASSWORD_CHANGE_FIELD.NEW_PASSWORD]: newPasswordError,
      [PASSWORD_CHANGE_FIELD.CONFIRM_PASSWORD]: confirmPasswordError,
    }

    setFieldErrors(nextFieldErrors)

    if (newPasswordError || confirmPasswordError) {
      if (newPasswordError) {
        newPasswordInputRef.current?.focus()
      } else {
        confirmPasswordInputRef.current?.focus()
      }

      return
    }

    // Clear any prior server-driven status/field errors before the new attempt
    // so a retry starts from a clean, non-stale surface.
    setStatusMessage(undefined)
    setIsPending(true)

    try {
      const response = await fetch(
        "/api/v1/auth/change-password",
        buildChangePasswordRequest(accessToken, newPassword)
      )

      await handleResponse(response)
    } catch {
      // Network failure or any unexpected rejection stays retryable and never
      // leaks the underlying error (Req 4.9).
      setStatusMessage(PASSWORD_CHANGE_STATUS_MESSAGE.RETRYABLE_FAILURE)
    } finally {
      // Wipe both password fields so no secret lingers in the rendered inputs on
      // any branch, and release the pending state to allow a retry. The access
      // token stays only in ephemeral props/state and is never persisted or
      // rendered (Req 4.1, 4.2, 4.6).
      setNewPassword("")
      setConfirmPassword("")
      setIsPending(false)
    }
  }

  return (
    <form
      aria-busy={isPending}
      className="w-full space-y-5"
      noValidate
      onSubmit={handleSubmit}
    >
      <h2 className="text-xl font-semibold">Cambio de contraseña obligatorio</h2>
      <div className="space-y-2">
        <Label htmlFor="password-change-new-password">Nueva contraseña</Label>
        <Input
          aria-describedby={
            fieldErrors.newPassword
              ? "password-change-new-password-error"
              : undefined
          }
          aria-invalid={fieldErrors.newPassword ? true : undefined}
          autoComplete="new-password"
          className="h-11"
          id="password-change-new-password"
          name="newPassword"
          onChange={(event) => setNewPassword(event.target.value)}
          ref={newPasswordInputRef}
          type="password"
          value={newPassword}
        />
        {fieldErrors.newPassword ? (
          <Alert
            aria-live="assertive"
            id="password-change-new-password-error"
            variant="destructive"
          >
            {fieldErrors.newPassword}
          </Alert>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password-change-confirm-password">
          Confirmar nueva contraseña
        </Label>
        <Input
          aria-describedby={
            fieldErrors.confirmPassword
              ? "password-change-confirm-password-error"
              : undefined
          }
          aria-invalid={fieldErrors.confirmPassword ? true : undefined}
          autoComplete="new-password"
          className="h-11"
          id="password-change-confirm-password"
          name="confirmPassword"
          onChange={(event) => setConfirmPassword(event.target.value)}
          ref={confirmPasswordInputRef}
          type="password"
          value={confirmPassword}
        />
        {fieldErrors.confirmPassword ? (
          <Alert
            aria-live="assertive"
            id="password-change-confirm-password-error"
            variant="destructive"
          >
            {fieldErrors.confirmPassword}
          </Alert>
        ) : null}
      </div>
      {isPending ? (
        <p aria-live="polite" role="status">
          {PASSWORD_CHANGE_STATUS_MESSAGE.IN_PROGRESS}
        </p>
      ) : statusMessage ? (
        <Alert aria-atomic="true" aria-live="polite" role="status">
          {statusMessage}
        </Alert>
      ) : null}
      <Button className="h-11 w-full" disabled={isPending} type="submit">
        {isPending
          ? PASSWORD_CHANGE_STATUS_MESSAGE.IN_PROGRESS
          : "Cambiar contraseña"}
      </Button>
    </form>
  )
}
