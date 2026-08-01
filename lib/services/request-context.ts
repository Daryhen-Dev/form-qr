import 'server-only'
import { verifyAccessToken } from '@/lib/services/token.service'
import type { Principal } from '@/lib/types'

/**
 * Extracts and verifies the Bearer access token from the Authorization header.
 * Returns a typed Principal on success.
 *
 * Route handlers use this to re-verify the acting principal (defense-in-depth:
 * proxy does an optimistic coarse check; handlers verify per Next.js guidance).
 *
 * @throws {Response} 401 JSON response if the header is missing, malformed, or the token is invalid/expired.
 */
export async function requirePrincipal(request: Request): Promise<Principal> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    throw Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  try {
    const claims = await verifyAccessToken(token)
    return {
      userId: claims.sub,
      role: claims.role,
      passwordChangeRequired: claims.pcr,
    }
  } catch {
    throw Response.json({ error: 'unauthorized' }, { status: 401 })
  }
}
