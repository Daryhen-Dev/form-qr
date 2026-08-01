import 'server-only'
import QRCode from 'qrcode'
import { findById } from '@/lib/repositories/questionnaire.repository'
import { ServiceError } from '@/lib/services/auth.service'
import type { Principal, QrDTO } from '@/lib/types'

/**
 * Asserts that the principal has Administrador or Secretario role.
 * Throws ServiceError(403) for Empleado (spec QR-01: unauthorized role).
 */
function assertManagementRole(principal: Principal): void {
  if (principal.role === 'Empleado') {
    throw new ServiceError(403, 'insufficient_permissions')
  }
}

/**
 * Retrieves QR data for a questionnaire.
 *
 * Authorization: Administrador or Secretario only (Empleado → 403).
 *
 * The qrToken is permanent and stable across version publishes. The QR encodes
 * the employee-facing scan URL derived from APP_URL. The SVG is rendered server-
 * side via the `qrcode` library (resolution-independent, no client bundling needed).
 *
 * @param principal      Authenticated caller.
 * @param questionnaireId The questionnaire template id.
 * @returns QrDTO { qrToken, scanUrl, qrSvg }
 * @throws ServiceError(403) if caller is Empleado.
 * @throws ServiceError(404) if questionnaire is not found or soft-deleted.
 */
export async function getQr(
  principal: Principal,
  questionnaireId: string
): Promise<QrDTO> {
  assertManagementRole(principal)

  const questionnaire = await findById(questionnaireId)
  if (!questionnaire) {
    throw new ServiceError(404, 'questionnaire_not_found')
  }

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const scanUrl = `${appUrl}/scan/${questionnaire.qrToken}`

  // Render an SVG QR code string. The `qrcode` library's toString with type:'svg'
  // returns the full XML string. Error correction level 'M' is sufficient for scan URLs.
  const qrSvg = await QRCode.toString(scanUrl, { type: 'svg', errorCorrectionLevel: 'M' })

  return {
    qrToken: questionnaire.qrToken,
    scanUrl,
    qrSvg,
  }
}
