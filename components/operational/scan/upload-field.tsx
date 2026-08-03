"use client"

import { useState } from "react"

import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import { Alert } from "@/components/ui/alert"
import { SAFE_STATUS_MESSAGE } from "@/lib/operational-api/contracts"
import { uploadResponseFile } from "@/lib/operational-api/uploads"

/**
 * File/photo answer control for the employee scan flow.
 *
 * For `photo`/`file` questions the browser never sends the file through a
 * protected `/api/v1` call directly: it requests a presigned target, PUTs the
 * bytes to the returned URL WITHOUT the access token, and keeps ONLY the
 * server-issued `objectKey` as the answer value (Requirement 5.6).
 *
 * CRITICAL: when the control is inactive (scan status `read_only`) or otherwise
 * disabled, it renders a read-only view and NEVER requests a presign or
 * uploads anything — the Proof that `read_only` disables presign
 * (Requirements 5.5, 8.4).
 */

interface UploadFieldProps {
  readonly accessToken: string
  readonly questionnaireId: string
  readonly questionId: string
  /** Current stored object key (empty when no file has been uploaded). */
  readonly value: string
  readonly onChange: (objectKey: string) => void
  /** Whether uploads are active for the current scan status. */
  readonly active: boolean
  readonly disabled: boolean
  readonly required: boolean
  readonly inputId: string
  readonly describedById?: string
  readonly fieldError?: string
}

const UPLOAD_STATE = {
  IDLE: "idle",
  UPLOADING: "uploading",
  ERROR: "error",
} as const

type UploadState = (typeof UPLOAD_STATE)[keyof typeof UPLOAD_STATE]

export function UploadField({
  accessToken,
  questionnaireId,
  questionId,
  value,
  onChange,
  active,
  disabled,
  required,
  inputId,
  describedById,
  fieldError,
}: UploadFieldProps) {
  const [state, setState] = useState<UploadState>(UPLOAD_STATE.IDLE)

  const storedLabel =
    value.length > 0 ? "Archivo cargado." : "Sin archivo cargado."

  // read_only / inactive: present the stored value WITHOUT any upload trigger
  // so no presign or PUT can ever be issued.
  if (!active) {
    return (
      <p className="text-sm text-muted-foreground" id={describedById}>
        {storedLabel}
      </p>
    )
  }

  async function handleFile(file: File | undefined) {
    if (file === undefined || disabled || state === UPLOAD_STATE.UPLOADING) {
      return
    }

    setState(UPLOAD_STATE.UPLOADING)

    const result = await uploadResponseFile(
      accessToken,
      {
        questionnaireId,
        questionId,
        mimeType: file.type,
        sizeBytes: file.size,
      },
      file
    )

    if (result.kind === "success") {
      onChange(result.data)
      setState(UPLOAD_STATE.IDLE)
      return
    }

    setState(UPLOAD_STATE.ERROR)
  }

  const uploading = state === UPLOAD_STATE.UPLOADING

  return (
    <div className="space-y-2">
      <input
        aria-describedby={fieldError ? describedById : undefined}
        aria-invalid={fieldError ? true : undefined}
        aria-required={required || undefined}
        className="block w-full min-w-0 text-sm file:mr-3 file:inline-flex file:h-8 file:items-center file:rounded-4xl file:border-0 file:bg-primary file:px-3 file:text-sm file:font-medium file:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || uploading}
        id={inputId}
        onChange={(event) => void handleFile(event.target.files?.[0])}
        type="file"
      />
      <p className="text-xs text-muted-foreground">
        {uploading ? "Cargando archivo…" : storedLabel}
      </p>
      {value.length > 0 ? (
        <ActionActivation
          className="inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={disabled || uploading}
          onActivate={() => onChange("")}
        >
          Quitar archivo
        </ActionActivation>
      ) : null}
      {state === UPLOAD_STATE.ERROR ? (
        <StatusRegion message={SAFE_STATUS_MESSAGE.RETRYABLE} tone="error" />
      ) : null}
      {fieldError ? (
        <Alert aria-live="assertive" id={describedById} variant="destructive">
          {fieldError}
        </Alert>
      ) : null}
    </div>
  )
}

export default UploadField
