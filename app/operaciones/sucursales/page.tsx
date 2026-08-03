import { RoleRouteGate } from "@/components/access/role-route-gate"
import { BranchesAdmin } from "@/components/operational/admin/branches"

export default function SucursalesPage() {
  return (
    <RoleRouteGate>
      <BranchesAdmin />
    </RoleRouteGate>
  )
}
