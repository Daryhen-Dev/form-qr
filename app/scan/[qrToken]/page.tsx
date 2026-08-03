import { ScanResolver } from "@/components/operational/scan/scan-resolver"

/**
 * Employee QR scan page for `/scan/[qrToken]`.
 *
 * In the App Router the dynamic route `params` is a promise, so this Server
 * Component awaits it before handing the `qrToken` to the client
 * {@link ScanResolver}. The resolver owns access gating (it presents the login
 * flow when there is no current access context) and resolves the QR link
 * through `GET /api/v1/scan/:qrToken`, so no protected data is loaded on the
 * server (Requirements 5.1, 1.1, 1.2).
 */
export default async function ScanTokenPage({
  params,
}: {
  params: Promise<{ qrToken: string }>
}) {
  const { qrToken } = await params

  return <ScanResolver qrToken={qrToken} />
}
