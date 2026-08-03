"use client"

import { usePathname, useRouter } from "next/navigation"
import { useEffect, type ReactNode } from "react"

import { useAccess } from "@/components/access/access-provider"
import { AccessShell } from "@/components/access/access-shell"
import { RoleNavigation } from "@/components/access/role-navigation"
import { StatusRegion } from "@/components/access/status-region"
import {
  ROUTE_SURFACE_MODE,
  resolveRouteSurface,
} from "@/lib/operational-ui/routes"

/**
 * Route gate for the operational shells.
 *
 * Derives the authorized surface for the current in-memory access context and
 * the requested path via `resolveRouteSurface` (the single source of truth):
 *
 * - Missing context or an unadmitted role presents the login interface.
 * - An active mandatory password change presents only that flow.
 * - A path that does not belong to the role is replaced by the role's
 *   authorized start route using internal constant routes, while a single safe
 *   status message is announced through `StatusRegion` (no permissions,
 *   resources, or internal routes are revealed).
 * - An authorized path presents the role navigation and the requested surface.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 9.1, 9.2
 */

interface RoleRouteGateProps {
  children: ReactNode
}

export function RoleRouteGate({ children }: RoleRouteGateProps) {
  const { access } = useAccess()
  const pathname = usePathname()
  const router = useRouter()

  const surface = resolveRouteSurface(
    access === undefined
      ? undefined
      : { role: access.role, availability: access.availability },
    pathname
  )

  const redirectRoute =
    surface.mode === ROUTE_SURFACE_MODE.OPERATIONAL &&
    surface.activeRoute !== null &&
    surface.activeRoute !== pathname
      ? surface.activeRoute
      : null

  useEffect(() => {
    if (redirectRoute !== null) {
      router.replace(redirectRoute)
    }
  }, [redirectRoute, router])

  // Missing context / invalid role → login; restricted → mandatory change.
  if (
    surface.mode === ROUTE_SURFACE_MODE.LOGIN ||
    surface.mode === ROUTE_SURFACE_MODE.PASSWORD_CHANGE
  ) {
    return <AccessShell />
  }

  // Operational surface always implies an admitted, available role.
  if (access === undefined) {
    return null
  }

  // Denied path: announce a single safe message while the replacement to the
  // authorized start route completes.
  if (redirectRoute !== null) {
    return (
      <main className="flex min-h-svh w-full items-center bg-background px-4 py-8 sm:px-6">
        <div className="mx-auto w-full min-w-0 max-w-md">
          <StatusRegion
            message={surface.statusMessage ?? undefined}
            tone="error"
          />
        </div>
      </main>
    )
  }

  // Authorized path: present role navigation and the requested surface.
  return (
    <div className="flex min-h-svh w-full flex-col bg-background">
      <header className="border-b px-4 py-3 sm:px-6">
        <RoleNavigation
          activeRoute={surface.activeRoute}
          allowedRoutes={surface.allowedRoutes}
          role={access.role}
        />
      </header>
      <main className="w-full min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
