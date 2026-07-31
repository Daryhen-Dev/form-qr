import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Named proxy export — required by Next.js 16 (middleware.ts is deprecated).
 * This stub passes all /api/* traffic through without modification.
 *
 * SLICE-2 INSERTION POINT: JWT/session validation goes here (verify token → 401 on failure)
 */
export function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
