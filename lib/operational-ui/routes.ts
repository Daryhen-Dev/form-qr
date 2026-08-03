import {
  ACCESS_AVAILABILITY,
  ACCESS_ROLE,
  isAccessRole,
  type AccessAvailability,
  type AccessRole,
} from "@/components/access/access-provider"

/**
 * Route surface derivation for the operational web application.
 *
 * Pure logic that maps a browser-only access candidate and a requested path to
 * the authorized navigation surface. It never grants operations to an invalid
 * or restricted context, and it safely returns a denied route to the role's
 * authorized start with a status message that reveals no internal detail.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4
 */

export const ROUTE_SURFACE_MODE = {
  /** No valid access context: only the login interface is presented. */
  LOGIN: "login",
  /** Mandatory password change is active: only that flow is presented. */
  PASSWORD_CHANGE: "password_change",
  /** Valid, available role: role-scoped operational surface is enabled. */
  OPERATIONAL: "operational",
} as const

export type RouteSurfaceMode =
  (typeof ROUTE_SURFACE_MODE)[keyof typeof ROUTE_SURFACE_MODE]

/** Safe status message shown when a requested route is not available. */
export const UNAUTHORIZED_ROUTE_MESSAGE = "Acceso no disponible."

/** Operational routes reachable from the management shell. */
export const OPERATIONAL_ROUTE = {
  HOME: "/operaciones",
  USERS: "/operaciones/usuarios",
  BRANCHES: "/operaciones/sucursales",
  QUESTIONNAIRES: "/operaciones/cuestionarios",
  REPORTS: "/operaciones/reportes",
} as const

/** Employee scan flow route. */
export const SCAN_ROUTE = {
  HOME: "/scan",
} as const

/**
 * Authorized route surface for a role: its allowed routes and the start route
 * used both as the initial view and as the safe fallback for a denied path.
 */
interface RoleRouteSurface {
  readonly start: string
  readonly allowed: readonly string[]
}

/** Management surface shared by Administrador and Secretario. */
const MANAGEMENT_SURFACE: RoleRouteSurface = {
  start: OPERATIONAL_ROUTE.HOME,
  allowed: [
    OPERATIONAL_ROUTE.HOME,
    OPERATIONAL_ROUTE.USERS,
    OPERATIONAL_ROUTE.BRANCHES,
    OPERATIONAL_ROUTE.QUESTIONNAIRES,
    OPERATIONAL_ROUTE.REPORTS,
  ],
}

/** Employee scan surface. */
const SCAN_SURFACE: RoleRouteSurface = {
  start: SCAN_ROUTE.HOME,
  allowed: [SCAN_ROUTE.HOME],
}

/**
 * Single source of truth for the route surface (allowed routes and start
 * route) of each admitted role.
 */
const ROLE_ROUTE_SURFACE: Record<AccessRole, RoleRouteSurface> = {
  [ACCESS_ROLE.ADMINISTRADOR]: MANAGEMENT_SURFACE,
  [ACCESS_ROLE.SECRETARIO]: MANAGEMENT_SURFACE,
  [ACCESS_ROLE.EMPLEADO]: SCAN_SURFACE,
}

/** Minimal access shape needed to derive the route surface. */
export interface RouteAccess {
  readonly role: AccessRole | string
  readonly availability: AccessAvailability
}

export interface RouteSurface {
  readonly mode: RouteSurfaceMode
  readonly operationsEnabled: boolean
  readonly activeRoute: string | null
  readonly allowedRoutes: readonly string[]
  readonly statusMessage: string | null
}

function disabledSurface(mode: RouteSurfaceMode): RouteSurface {
  return {
    mode,
    operationsEnabled: false,
    activeRoute: null,
    allowedRoutes: [],
    statusMessage: null,
  }
}

/**
 * Derive the authorized route surface for a given access candidate and
 * requested path.
 *
 * - No context or an unadmitted role → LOGIN with every operation disabled.
 * - Restricted availability → PASSWORD_CHANGE with every operation disabled.
 * - Admitted, available role → OPERATIONAL with role-scoped routes; a denied
 *   requested path returns to the role's start with a safe status message.
 */
export function resolveRouteSurface(
  access: RouteAccess | undefined,
  requestedPath: string
): RouteSurface {
  const role = access?.role

  if (access === undefined || !isAccessRole(role)) {
    return disabledSurface(ROUTE_SURFACE_MODE.LOGIN)
  }

  const validatedAccess = access

  if (validatedAccess.availability === ACCESS_AVAILABILITY.RESTRICTED) {
    return disabledSurface(ROUTE_SURFACE_MODE.PASSWORD_CHANGE)
  }

  const { start: initialRoute, allowed: allowedRoutes } = ROLE_ROUTE_SURFACE[role]

  if (allowedRoutes.includes(requestedPath)) {
    return {
      mode: ROUTE_SURFACE_MODE.OPERATIONAL,
      operationsEnabled: true,
      activeRoute: requestedPath,
      allowedRoutes,
      statusMessage: null,
    }
  }

  return {
    mode: ROUTE_SURFACE_MODE.OPERATIONAL,
    operationsEnabled: true,
    activeRoute: initialRoute,
    allowedRoutes,
    statusMessage: UNAUTHORIZED_ROUTE_MESSAGE,
  }
}
