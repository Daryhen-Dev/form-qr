import { RoleRouteGate } from "@/components/access/role-route-gate"
import { QuestionnaireEditor } from "@/components/operational/questionnaires/editor"

/**
 * Questionnaires management page.
 *
 * `RoleRouteGate` matches internal routes exactly, so the full questionnaire
 * lifecycle (versions, branch assignments, QR) is composed as embedded panels
 * within this single authorized `/operaciones/cuestionarios` surface rather
 * than across dynamic sub-routes.
 */
export default function CuestionariosPage() {
  return (
    <RoleRouteGate>
      <QuestionnaireEditor />
    </RoleRouteGate>
  )
}
