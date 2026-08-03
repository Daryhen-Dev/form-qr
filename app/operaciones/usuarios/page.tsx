import { RoleRouteGate } from "@/components/access/role-route-gate"
import { UsersAdmin } from "@/components/operational/admin/users"

export default function UsuariosPage() {
  return (
    <RoleRouteGate>
      <UsersAdmin />
    </RoleRouteGate>
  )
}
