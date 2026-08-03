import { requestProtected } from '@/lib/operational-api/client'
import type {
  ProtectedResult,
  ScanResolutionDTO,
} from '@/lib/operational-api/contracts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Projects the `GET /api/v1/scan/:qrToken` envelope `{ scan: ScanResolutionDTO }`
 * into a `ScanResolutionDTO`. Validates the JSON as `unknown` before projecting;
 * returns `undefined` when the expected shape is absent so the client surfaces a
 * retryable result instead of leaking an unexpected body.
 */
function projectScanResolution(payload: unknown): ScanResolutionDTO | undefined {
  if (!isRecord(payload) || !isRecord(payload.scan)) {
    return undefined
  }

  const scan = payload.scan
  const hasShape =
    typeof scan.questionnaireId === 'string' &&
    typeof scan.status === 'string' &&
    isRecord(scan.version) &&
    Array.isArray(scan.questions)

  return hasShape ? (scan as unknown as ScanResolutionDTO) : undefined
}

/**
 * Resolves a QR link for an Empleado via `GET /api/v1/scan/:qrToken`.
 * Returns the ordered questions, the `absent | editable | read_only` status,
 * and today's daily response inside a `ProtectedResult`.
 */
export async function resolveScan(
  accessToken: string,
  qrToken: string
): Promise<ProtectedResult<ScanResolutionDTO>> {
  return requestProtected<ScanResolutionDTO>({
    accessToken,
    method: 'GET',
    path: `/scan/${encodeURIComponent(qrToken)}`,
    project: projectScanResolution,
  })
}
