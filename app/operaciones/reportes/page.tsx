import { RoleRouteGate } from "@/components/access/role-route-gate"
import { ReportsView } from "@/components/operational/reports/reports-view"

/**
 * Operational reports page.
 *
 * `RoleRouteGate` matches internal routes exactly, and only
 * `/operaciones/reportes` is an authorized route, so the pending, compliance
 * and history reports are composed as embedded views selected within this
 * single authorized surface (via a report-type selector) rather than across
 * unreachable `reportes/{pending,compliance,history}` sub-routes. This keeps
 * every report reachable without widening the authorized surface (Property 1).
 */
export default function ReportesPage() {
  return (
    <RoleRouteGate>
      <ReportsView />
    </RoleRouteGate>
  )
}
