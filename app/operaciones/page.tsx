import { RoleRouteGate } from "@/components/access/role-route-gate"

export default function OperacionesPage() {
  return (
    <RoleRouteGate>
      <section className="mx-auto w-full min-w-0 max-w-3xl space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Operaciones
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Seleccione una operación autorizada para continuar.
        </p>
      </section>
    </RoleRouteGate>
  )
}
