"use client"

import { useCallback, useEffect, useState } from "react"

import { AccessShell } from "@/components/access/access-shell"
import {
  ACCESS_AVAILABILITY,
  useAccess,
} from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import { DynamicResponseForm } from "@/components/operational/scan/dynamic-response-form"
import { generalIssueMessage } from "@/components/operational/admin/operation-feedback"
import {
  isProtectedSuccess,
  type ScanResolutionDTO,
} from "@/lib/operational-api/contracts"
import { resolveScan } from "@/lib/operational-api/scan"

/**
 * Employee QR resolution surface for `/scan/[qrToken]`.
 *
 * Resolves the QR link through `GET /api/v1/scan/:qrToken` and presents the
 * ordered questions, the `absent | editable | read_only` status, and today's
 * daily response (Requirement 5.1). Because access exists only in memory after
 * login, this client island gates itself: without a current access context it
 * presents the login interface, and while a mandatory password change is active
 * it presents only that flow (Requirements 1.1, 1.2). The access token is used
 * solely to authorize the scan request and never rendered (Requirement 8.1).
 *
 * The resolver owns re-resolution: after a successful save or an HTTP 409
 * conflict the form calls `reload`, which re-fetches the scan so only the action
 * allowed by the freshly reported status stays enabled (Requirement 5.7).
 */

const RESOLVE_STATE = {
  LOADING: "loading",
  RESOLVED: "resolved",
  ERROR: "error",
} as const

type ResolveState = (typeof RESOLVE_STATE)[keyof typeof RESOLVE_STATE]

interface ScanResolverProps {
  readonly qrToken: string
}

export function ScanResolver({ qrToken }: ScanResolverProps) {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""
  const isAvailable =
    access !== undefined &&
    access.availability === ACCESS_AVAILABILITY.AVAILABLE

  const [state, setState] = useState<ResolveState>(RESOLVE_STATE.LOADING)
  const [resolution, setResolution] = useState<ScanResolutionDTO>()
  const [errorMessage, setErrorMessage] = useState<string>()
  // Bumped on every (re)resolution so the form remounts with fresh state.
  const [reloadToken, setReloadToken] = useState(0)

  const resolve = useCallback(async () => {
    if (!isAvailable) {
      return
    }

    setState(RESOLVE_STATE.LOADING)
    const result = await resolveScan(accessToken, qrToken)

    if (isProtectedSuccess(result)) {
      setResolution(result.data)
      setErrorMessage(undefined)
      setState(RESOLVE_STATE.RESOLVED)
      setReloadToken((token) => token + 1)
      return
    }

    setResolution(undefined)
    setErrorMessage(generalIssueMessage(result))
    setState(RESOLVE_STATE.ERROR)
  }, [accessToken, qrToken, isAvailable])

  useEffect(() => {
    if (!isAvailable) {
      return
    }

    let active = true

    async function loadInitialResolution() {
      const result = await resolveScan(accessToken, qrToken)
      if (!active) {
        return
      }

      if (isProtectedSuccess(result)) {
        setResolution(result.data)
        setErrorMessage(undefined)
        setState(RESOLVE_STATE.RESOLVED)
        setReloadToken((token) => token + 1)
        return
      }

      setResolution(undefined)
      setErrorMessage(generalIssueMessage(result))
      setState(RESOLVE_STATE.ERROR)
    }

    void loadInitialResolution()
    return () => {
      active = false
    }
  }, [accessToken, isAvailable, qrToken])

  // No current context / mandatory password change → present login flow only.
  if (!isAvailable) {
    return <AccessShell />
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Cuestionario diario
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Complete las preguntas asignadas para su sucursal.
        </p>
      </header>

      {state === RESOLVE_STATE.LOADING ? (
        <StatusRegion message="Cargando cuestionario…" />
      ) : null}

      {state === RESOLVE_STATE.ERROR ? (
        <div className="space-y-3">
          <StatusRegion message={errorMessage} tone="error" />
          <ActionActivation
            className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            onActivate={() => void resolve()}
          >
            Reintentar
          </ActionActivation>
        </div>
      ) : null}

      {state === RESOLVE_STATE.RESOLVED && resolution !== undefined ? (
        <DynamicResponseForm
          accessToken={accessToken}
          key={reloadToken}
          onRescan={() => void resolve()}
          questionnaireId={resolution.questionnaireId}
          questions={resolution.questions}
          response={resolution.response}
          status={resolution.status}
        />
      ) : null}
    </section>
  )
}

export default ScanResolver
