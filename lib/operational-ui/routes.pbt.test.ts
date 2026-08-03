import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  ACCESS_AVAILABILITY,
  ACCESS_ROLE,
  type AccessAvailability,
  type AccessRole,
} from '@/components/access/access-provider'
import {
  ROUTE_SURFACE_MODE,
  resolveRouteSurface,
  type RouteSurface,
} from '@/lib/operational-ui/routes'

// Feature: operational-web-application, Property 1: Superficie autorizada
// **Validates: Requirements 1.1, 1.2, 1.3, 2.4**

interface RouteAccessCandidate {
  readonly role: AccessRole | string
  readonly availability: AccessAvailability
}

const INITIAL_ROUTE_BY_ROLE = {
  [ACCESS_ROLE.ADMINISTRADOR]: '/operaciones',
  [ACCESS_ROLE.SECRETARIO]: '/operaciones',
  [ACCESS_ROLE.EMPLEADO]: '/scan',
} as const

const unauthorizedMessage = 'Acceso no disponible.'
const validRoles = Object.values(ACCESS_ROLE)
const validRoleArbitrary = fc.constantFrom(...validRoles)
const invalidRoleArbitrary = fc
  .string()
  .filter((role) => !validRoles.includes(role as AccessRole))
const accessCandidateArbitrary: fc.Arbitrary<RouteAccessCandidate | undefined> =
  fc.oneof(
    fc.constant(undefined),
    fc.record({
      role: fc.oneof(validRoleArbitrary, invalidRoleArbitrary),
      availability: fc.constantFrom(
        ACCESS_AVAILABILITY.AVAILABLE,
        ACCESS_AVAILABILITY.RESTRICTED
      ),
    })
  )
const requestedPathArbitrary = fc.oneof(
  fc.constant('/operaciones'),
  fc.constant('/scan'),
  fc.stringMatching(/^\/[a-z0-9/-]{0,80}$/)
)

function isValidRole(role: string | undefined): role is AccessRole {
  return role !== undefined && validRoles.includes(role as AccessRole)
}

function expectDisabledSurface(surface: RouteSurface, mode: RouteSurface['mode']) {
  expect(surface.mode).toBe(mode)
  expect(surface.operationsEnabled).toBe(false)
  expect(surface.activeRoute).toBeNull()
  expect(surface.allowedRoutes).toEqual([])
}

describe('authorized operational route surface', () => {
  it('enables only an available valid role and safely returns denied routes to its authorized start', () => {
    fc.assert(
      fc.property(accessCandidateArbitrary, requestedPathArbitrary, (access, requestedPath) => {
        const surface = resolveRouteSurface(access, requestedPath)
        const role = access?.role

        if (access === undefined || !isValidRole(role)) {
          expectDisabledSurface(surface, ROUTE_SURFACE_MODE.LOGIN)
          return
        }

        const validatedAccess = access

        if (validatedAccess.availability === ACCESS_AVAILABILITY.RESTRICTED) {
          expectDisabledSurface(surface, ROUTE_SURFACE_MODE.PASSWORD_CHANGE)
          return
        }

        expect(surface.mode).toBe(ROUTE_SURFACE_MODE.OPERATIONAL)
        expect(surface.operationsEnabled).toBe(true)
        expect(surface.allowedRoutes).toContain(INITIAL_ROUTE_BY_ROLE[role])

        if (surface.allowedRoutes.includes(requestedPath)) {
          expect(surface.activeRoute).toBe(requestedPath)
          expect(surface.statusMessage).toBeNull()
          return
        }

        expect(surface.activeRoute).toBe(INITIAL_ROUTE_BY_ROLE[role])
        expect(surface.statusMessage).toBe(unauthorizedMessage)
      }),
      { numRuns: 100 }
    )
  })
})
