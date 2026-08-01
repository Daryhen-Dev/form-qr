import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyAccessToken } from '@/lib/services/token.service'

/**
 * Claim-based JWT gate for all /api/* routes.
 *
 * Route classification:
 *   PUBLIC       — no token required; pass through unconditionally
 *   FORCED-CHANGE-ALLOWED — token required; valid even when pcr=true
 *   GATED        — token required; pcr must be false; coarse role gate applied
 *
 * Proxy does optimistic coarse checks only (per Next.js docs).
 * Fine-grained authz is re-enforced in service layer.
 * No DB access here — claims only.
 */

/** Routes that require no authentication. */
const PUBLIC_ROUTES = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
])

/** Routes that are accessible even when passwordChangeRequired=true. */
const FORCED_CHANGE_ALLOWED_ROUTES = new Set([
  '/api/v1/auth/change-password',
  '/api/v1/auth/logout',
])

/** Routes that require role ∈ {Administrador, Secretario}. */
function requiresUserManagementRole(pathname: string): boolean {
  return pathname.startsWith('/api/v1/users')
}

export async function proxy(request: NextRequest): Promise<Response | NextResponse> {
  const { pathname } = request.nextUrl

  // 1. Public routes — pass through without any token check.
  if (PUBLIC_ROUTES.has(pathname)) {
    return NextResponse.next()
  }

  // 2. All other routes require a Bearer token.
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 3. Verify the token (pure, DB-free).
  let claims: Awaited<ReturnType<typeof verifyAccessToken>>
  try {
    claims = await verifyAccessToken(token)
  } catch {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 4. Forced-change gate: if pcr=true and route is not in the exempted set, block.
  if (claims.pcr === true && !FORCED_CHANGE_ALLOWED_ROUTES.has(pathname)) {
    return Response.json({ error: 'password_change_required' }, { status: 403 })
  }

  // 5. Coarse role gate for user-management routes: Empleado is denied.
  if (requiresUserManagementRole(pathname) && claims.role === 'Empleado') {
    return Response.json({ error: 'insufficient_permissions' }, { status: 403 })
  }

  // 6. Pass through — handlers re-verify the principal (defense-in-depth).
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
