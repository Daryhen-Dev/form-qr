"use client"

import { useState } from "react"

import { useAccess } from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import { operationFeedback } from "@/components/operational/admin/operation-feedback"
import { Label } from "@/components/ui/label"
import { isProtectedSuccess, type QrDTO } from "@/lib/operational-api/contracts"
import {
  createOperationStates,
  getOperation,
  isOperationPending,
  settleOperation,
  startOperation,
  type OperationStates,
} from "@/lib/operational-api/operation-state"
import { getQuestionnaireQr } from "@/lib/operational-api/questionnaires"

/**
 * QR panel for a questionnaire.
 *
 * Fetches the QR payload on demand via `GET /api/v1/questionnaires/:id/qr` and
 * presents the returned QR image and scan link exactly as the existing API
 * contract delivers them (Requirement 4.6). Nothing is derived optimistically:
 * the QR and link are shown only once the API result arrives.
 *
 * Every failure surfaces a single safe general message through `StatusRegion`
 * (Requirements 7.x, 9.4). The single "obtener QR" activation is disabled while
 * pending so the operation cannot be double-submitted (Requirement 7.1).
 */

const QR_OPERATION = "questionnaire-qr"

interface QrPanelProps {
  readonly questionnaireId: string
}

export function QrPanel({ questionnaireId }: QrPanelProps) {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""

  const [qr, setQr] = useState<QrDTO>()
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const operation = getOperation(states, QR_OPERATION)
  const feedback = operationFeedback(operation)
  const pending = isOperationPending(states, QR_OPERATION)

  async function handleFetchQr() {
    if (isOperationPending(states, QR_OPERATION)) {
      return
    }

    const { started, states: nextStates } = startOperation(states, QR_OPERATION)
    if (!started) {
      return
    }
    setStates(nextStates)

    const result = await getQuestionnaireQr(accessToken, questionnaireId)
    setStates((current) => settleOperation(current, QR_OPERATION, result))

    if (isProtectedSuccess(result)) {
      setQr(result.data)
    }
  }

  return (
    <div
      aria-label="Código QR del cuestionario"
      className="min-w-0 space-y-4 rounded-lg border p-4"
      role="group"
    >
      <h3 className="text-base font-semibold">Código QR</h3>

      <div className="flex flex-wrap gap-2">
        <ActionActivation
          className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={pending}
          onActivate={() => void handleFetchQr()}
        >
          {pending ? "Obteniendo…" : qr === undefined ? "Obtener QR" : "Actualizar QR"}
        </ActionActivation>
      </div>

      <StatusRegion message={feedback.message} tone={feedback.tone} />

      {qr !== undefined ? (
        <div className="min-w-0 space-y-3">
          <div
            aria-label="Imagen del código QR"
            className="w-full max-w-60 [&_svg]:h-auto [&_svg]:w-full"
            role="img"
            // The QR SVG is produced by the existing form-qr backend contract.
            dangerouslySetInnerHTML={{ __html: qr.qrSvg }}
          />
          <div className="space-y-2">
            <Label htmlFor="qr-scan-url">Enlace del cuestionario</Label>
            <a
              className="block break-all rounded-md border px-3 py-2 text-sm text-primary underline underline-offset-2 focus-visible:ring-[3px] focus-visible:ring-ring/50"
              href={qr.scanUrl}
              id="qr-scan-url"
            >
              {qr.scanUrl}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default QrPanel
