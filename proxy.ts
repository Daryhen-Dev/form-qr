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

/** Routes that require role ∈ {Administrador, Secretario} — Empleado denied. */
function requiresQuestionnaireRole(pathname: string): boolean {
  return pathname.startsWith('/api/v1/questionnaires')
}

/** Routes that require role ∈ {Administrador, Secretario} — Empleado denied. */
function requiresBranchManagementRole(pathname: string): boolean {
  return pathname.startsWith('/api/v1/branches')
}

/** Routes that require role ∈ {Administrador, Secretario} — Empleado denied. */
function requiresReportRole(pathname: string): boolean {
  return pathname.startsWith('/api/v1/reports')
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

  // 6. Coarse role gate for questionnaire-management routes: Empleado is denied.
  if (requiresQuestionnaireRole(pathname) && claims.role === 'Empleado') {
    return Response.json({ error: 'insufficient_permissions' }, { status: 403 })
  }

  // 7. Coarse role gate for branch-management routes: Empleado is denied.
  if (requiresBranchManagementRole(pathname) && claims.role === 'Empleado') {
    return Response.json({ error: 'insufficient_permissions' }, { status: 403 })
  }

  // 8. Coarse role gate for report routes: Empleado is denied.
  if (requiresReportRole(pathname) && claims.role === 'Empleado') {
    return Response.json({ error: 'insufficient_permissions' }, { status: 403 })
  }

  // 9. Pass through — handlers re-verify the principal (defense-in-depth).
  //
  // ---------------------------------------------------------------------------
  // Sub-PR 5a: Empleado-reachable routes — intentional classification note
  // ---------------------------------------------------------------------------
  // The following route prefixes are intentionally NOT added to any
  // Empleado-denied classifier above:
  //
  //   /api/v1/scan*       — Employee QR scan resolution (scan.service re-asserts
  //                         Empleado role + active-branch assignment + questionnaire
  //                         assignment as defense-in-depth).
  //   /api/v1/responses*  — Employee daily response CRUD (response.service, Sub-PR 5b).
  //   /api/v1/uploads*    — Employee file/photo presign (upload.service, Sub-PR 5d).
  //
  // These routes do NOT start with 'users', 'questionnaires', or 'branches', so
  // they fall through to NextResponse.next() after the Bearer + pcr checks. Any
  // authenticated principal with a valid, non-expired token and pcr=false may
  // reach the handler; fine-grained role checks (Empleado-only) and ownership
  // enforcement live in the services.
  //
  // The QR-management route /api/v1/questionnaires/[id]/qr DOES start with
  // 'questionnaires', so it is automatically covered by requiresQuestionnaireRole
  // above (Empleado → 403). No additional proxy code is needed for that route.
  // ---------------------------------------------------------------------------
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
