import { RoleRouteGate } from "@/components/access/role-route-gate"
import { AssignmentPanel } from "@/components/operational/admin/assignment-panel"

/**
 * Employee assignment page for a single branch.
 *
 * In the App Router, dynamic route `params` is an async value, so the Server
 * Component awaits it before handing the branch id to the client assignment
 * panel. `RoleRouteGate` enforces the in-memory role surface around it.
 */
export default async function EmpleadosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <RoleRouteGate>
      <section className="mx-auto w-full min-w-0 max-w-3xl space-y-4">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Empleados de la sucursal
        </h1>
        <AssignmentPanel branchId={id} />
      </section>
    </RoleRouteGate>
  )
}
