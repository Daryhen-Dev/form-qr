"use client"

import Link from "next/link"

import { ACCESS_ROLE, type AccessRole } from "@/components/access/access-provider"
import {
  OPERATIONAL_ROUTE,
  SCAN_ROUTE,
} from "@/lib/operational-ui/routes"
import { cn } from "@/lib/utils"

/**
 * Role-scoped operational navigation.
 *
 * Renders one accessible `Link` per authorized route in visual reading order.
 * Each link exposes a descriptive accessible name and is natively activatable
 * by pointer and keyboard, and the current route is announced with
 * `aria-current="page"` (Requirements 2.1, 2.2, 2.3, 9.1, 9.2).
 *
 * The authorized routes come from the route-surface source of truth, so this
 * component never widens the surface beyond what the role is allowed to reach.
 */

/** Human-readable Spanish label for each internal operational route. */
const ROUTE_LABEL: Record<string, string> = {
  [OPERATIONAL_ROUTE.HOME]: "Inicio",
  [OPERATIONAL_ROUTE.USERS]: "Usuarios",
  [OPERATIONAL_ROUTE.BRANCHES]: "Sucursales",
  [OPERATIONAL_ROUTE.QUESTIONNAIRES]: "Cuestionarios",
  [OPERATIONAL_ROUTE.REPORTS]: "Reportes",
  [SCAN_ROUTE.HOME]: "Cuestionario asignado",
}

/** Accessible name for the navigation landmark, by role. */
const NAVIGATION_LABEL: Record<AccessRole, string> = {
  [ACCESS_ROLE.ADMINISTRADOR]: "Navegación de operaciones",
  [ACCESS_ROLE.SECRETARIO]: "Navegación de operaciones",
  [ACCESS_ROLE.EMPLEADO]: "Navegación de cuestionario",
}

interface RoleNavigationProps {
  /** Current role; used only to name the navigation landmark. */
  role: AccessRole
  /** Authorized routes for the role, in visual reading order. */
  allowedRoutes: readonly string[]
  /** Route currently presented, announced as the active item. */
  activeRoute: string | null
}

export function RoleNavigation({
  role,
  allowedRoutes,
  activeRoute,
}: RoleNavigationProps) {
  return (
    <nav aria-label={NAVIGATION_LABEL[role]}>
      <ul className="flex min-w-0 flex-wrap gap-1">
        {allowedRoutes.map((route) => {
          const isActive = route === activeRoute

          return (
            <li key={route}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center rounded-4xl px-3 py-2 text-sm font-medium transition-colors outline-none",
                  "hover:bg-muted hover:text-foreground",
                  "focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                )}
                href={route}
              >
                {ROUTE_LABEL[route] ?? route}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
