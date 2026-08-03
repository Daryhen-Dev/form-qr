import { RoleRouteGate } from "@/components/access/role-route-gate"

export default function ScanPage() {
  return (
    <RoleRouteGate>
      <section className="mx-auto w-full min-w-0 max-w-3xl space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Cuestionarios asignados
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Abra el enlace QR asignado para completar su cuestionario diario.
        </p>
      </section>
    </RoleRouteGate>
  )
}
