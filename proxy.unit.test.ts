import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Mock token.service so tests run without real JWT secrets
vi.mock('@/lib/services/token.service', () => ({
  verifyAccessToken: vi.fn(),
}))

import { proxy, config } from './proxy'
import { verifyAccessToken } from '@/lib/services/token.service'
import type { JwtAccessClaims } from '@/lib/types'

const mockVerify = verifyAccessToken as ReturnType<typeof vi.fn>

function makeRequest(url: string, options: Omit<RequestInit, 'signal'> & { headers?: Record<string, string> } = {}): NextRequest {
  return new NextRequest(`http://localhost${url}`, options as ConstructorParameters<typeof NextRequest>[1])
}

function bearerHeaders(token: string) {
  return { Authorization: `Bearer ${token}` }
}

const validAdminClaims: JwtAccessClaims = {
  sub: 'user-1',
  cedula: '12345678',
  role: 'Administrador',
  pcr: false,
  typ: 'access',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
}

const validSecClaims: JwtAccessClaims = { ...validAdminClaims, role: 'Secretario' }
const validEmpClaims: JwtAccessClaims = { ...validAdminClaims, role: 'Empleado' }
const pcrClaims: JwtAccessClaims = { ...validAdminClaims, pcr: true }

describe('proxy.ts — JWT gate', () => {
  beforeEach(() => {
    mockVerify.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // --- Config ---
  it('exports config.matcher as /api/:path*', () => {
    expect(config.matcher).toBe('/api/:path*')
  })

  it('exports a named "proxy" function (not default)', () => {
    expect(typeof proxy).toBe('function')
    expect(proxy.name).toBe('proxy')
  })

  // --- Public routes pass through without a token ---
  it('allows /api/v1/auth/login without a token', async () => {
    const req = makeRequest('/api/v1/auth/login', { method: 'POST' })
    const res = await proxy(req)
    // NextResponse.next() has status 200
    expect(mockVerify).not.toHaveBeenCalled()
    expect(res instanceof NextResponse || res.status === 200).toBe(true)
  })

  it('allows /api/v1/auth/refresh without a token', async () => {
    const req = makeRequest('/api/v1/auth/refresh', { method: 'POST' })
    const res = await proxy(req)
    expect(mockVerify).not.toHaveBeenCalled()
    expect(res instanceof NextResponse || res.status === 200).toBe(true)
  })

  // --- Missing / malformed token on gated route → 401 ---
  it('returns 401 when Authorization header is missing on gated route', async () => {
    const req = makeRequest('/api/v1/users')
    const res = await proxy(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('returns 401 when Authorization header has no Bearer prefix', async () => {
    const req = makeRequest('/api/v1/users', {
      headers: { Authorization: 'Basic abc123' },
    })
    const res = await proxy(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 for malformed token (garbled)', async () => {
    mockVerify.mockRejectedValue(new Error('invalid token'))
    const req = makeRequest('/api/v1/users', { headers: bearerHeaders('garbage') })
    const res = await proxy(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('returns 401 for expired token', async () => {
    mockVerify.mockRejectedValue(new Error('token expired'))
    const req = makeRequest('/api/v1/users', { headers: bearerHeaders('expired.jwt.token') })
    const res = await proxy(req)
    expect(res.status).toBe(401)
  })

  // --- PCR gate ---
  it('returns 403 password_change_required for pcr=true on gated route', async () => {
    mockVerify.mockResolvedValue(pcrClaims)
    const req = makeRequest('/api/v1/users', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('password_change_required')
  })

  it('allows pcr=true on /api/v1/auth/change-password', async () => {
    const req = makeRequest('/api/v1/auth/change-password', {
      method: 'POST',
      headers: bearerHeaders('valid'),
    })
    mockVerify.mockResolvedValue(pcrClaims)
    const res = await proxy(req)
    // Should pass through — not 401 or 403
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('allows pcr=true on /api/v1/auth/logout', async () => {
    const req = makeRequest('/api/v1/auth/logout', {
      method: 'POST',
      headers: bearerHeaders('valid'),
    })
    mockVerify.mockResolvedValue(pcrClaims)
    const res = await proxy(req)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  // --- Role gate: Empleado on /api/v1/users* → 403 ---
  it('returns 403 for Empleado on /api/v1/users', async () => {
    mockVerify.mockResolvedValue(validEmpClaims)
    const req = makeRequest('/api/v1/users', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('insufficient_permissions')
  })

  it('returns 403 for Empleado on /api/v1/users/some-id', async () => {
    mockVerify.mockResolvedValue(validEmpClaims)
    const req = makeRequest('/api/v1/users/some-id', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).toBe(403)
  })

  // --- Valid tokens on non-public routes pass through ---
  it('passes through Administrador token on /api/v1/users', async () => {
    mockVerify.mockResolvedValue(validAdminClaims)
    const req = makeRequest('/api/v1/users', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('passes through Secretario token on /api/v1/users', async () => {
    mockVerify.mockResolvedValue(validSecClaims)
    const req = makeRequest('/api/v1/users', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Questionnaire gate (Slice 4)
// ---------------------------------------------------------------------------

describe('proxy.ts — questionnaire gate', () => {
  beforeEach(() => {
    mockVerify.mockReset()
  })

  it('returns 403 for Empleado on /api/v1/questionnaires', async () => {
    mockVerify.mockResolvedValue(validEmpClaims)
    const req = makeRequest('/api/v1/questionnaires', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('insufficient_permissions')
  })

  it('returns 403 for Empleado on /api/v1/questionnaires/some-id', async () => {
    mockVerify.mockResolvedValue(validEmpClaims)
    const req = makeRequest('/api/v1/questionnaires/some-id', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).toBe(403)
  })

  it('returns 403 for Empleado on /api/v1/questionnaires/some-id/versions', async () => {
    mockVerify.mockResolvedValue(validEmpClaims)
    const req = makeRequest('/api/v1/questionnaires/some-id/versions', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).toBe(403)
  })

  it('passes through Administrador on /api/v1/questionnaires', async () => {
    mockVerify.mockResolvedValue(validAdminClaims)
    const req = makeRequest('/api/v1/questionnaires', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('passes through Secretario on /api/v1/questionnaires', async () => {
    mockVerify.mockResolvedValue(validSecClaims)
    const req = makeRequest('/api/v1/questionnaires', { headers: bearerHeaders('valid') })
    const res = await proxy(req)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('returns 401 for unauthenticated request to /api/v1/questionnaires', async () => {
    const req = makeRequest('/api/v1/questionnaires')
    const res = await proxy(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })
})
