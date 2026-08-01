/**
 * Unit tests for qr.service — authorization, QR token stability, and SVG rendering.
 * All repositories and the qrcode lib are mocked.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/repositories/questionnaire.repository', () => ({
  findById: vi.fn(),
}))
vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn().mockResolvedValue('<svg/>'),
  },
}))

import { findById } from '@/lib/repositories/questionnaire.repository'
import QRCode from 'qrcode'
import { getQr } from './qr.service'
import type { Principal } from '@/lib/types'

const mockFindById = vi.mocked(findById)
// Cast toString mock to accept string resolution — the types/qrcode overloads
// include a void-return callback form; we use the Promise<string> form in production.
const mockQRCodeToString = QRCode.toString as ReturnType<typeof vi.fn>

const adminPrincipal: Principal = {
  userId: 'admin_01',
  role: 'Administrador',
  passwordChangeRequired: false,
}
const secretarioPrincipal: Principal = {
  userId: 'sec_01',
  role: 'Secretario',
  passwordChangeRequired: false,
}
const empleadoPrincipal: Principal = {
  userId: 'emp_01',
  role: 'Empleado',
  passwordChangeRequired: false,
}

const baseQuestionnaire = {
  id: 'q_01',
  title: 'Test Questionnaire',
  description: null,
  currentVersionId: 'v_01',
  qrToken: 'stable-token-123',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
}

const fakeSvg = '<svg xmlns="http://www.w3.org/2000/svg">...</svg>'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.APP_URL = 'http://localhost:3000'
  mockQRCodeToString.mockResolvedValue(fakeSvg)
})

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

describe('qr.service.getQr — authorization', () => {
  it('Empleado principal → throws 403 before any repo call', async () => {
    await expect(
      getQr(empleadoPrincipal, 'q_01')
    ).rejects.toMatchObject({ statusCode: 403, message: 'insufficient_permissions' })
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it('Administrador principal → proceeds to repo lookup', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)

    const result = await getQr(adminPrincipal, 'q_01')
    expect(result.qrToken).toBe('stable-token-123')
  })

  it('Secretario principal → proceeds to repo lookup', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)

    const result = await getQr(secretarioPrincipal, 'q_01')
    expect(result.qrToken).toBe('stable-token-123')
  })
})

// ---------------------------------------------------------------------------
// Not found
// ---------------------------------------------------------------------------

describe('qr.service.getQr — questionnaire not found', () => {
  it('returns 404 when questionnaire does not exist or is soft-deleted', async () => {
    mockFindById.mockResolvedValueOnce(null)

    await expect(
      getQr(adminPrincipal, 'nonexistent')
    ).rejects.toMatchObject({ statusCode: 404, message: 'questionnaire_not_found' })
  })
})

// ---------------------------------------------------------------------------
// Happy path — QrDTO shape and scanUrl
// ---------------------------------------------------------------------------

describe('qr.service.getQr — happy path', () => {
  it('returns QrDTO with correct shape and scanUrl', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)

    const result = await getQr(adminPrincipal, 'q_01')

    expect(result).toMatchObject({
      qrToken: 'stable-token-123',
      scanUrl: 'http://localhost:3000/scan/stable-token-123',
      qrSvg: fakeSvg,
    })
    expect(result.qrSvg.length).toBeGreaterThan(0)
  })

  it('builds scanUrl from APP_URL env var', async () => {
    process.env.APP_URL = 'https://example.com'
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)

    const result = await getQr(adminPrincipal, 'q_01')
    expect(result.scanUrl).toBe('https://example.com/scan/stable-token-123')
  })

  it('uses http://localhost:3000 fallback when APP_URL is not set', async () => {
    delete process.env.APP_URL
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)

    const result = await getQr(adminPrincipal, 'q_01')
    expect(result.scanUrl).toContain('http://localhost:3000/scan/')
  })
})

// ---------------------------------------------------------------------------
// QR stability — same token across calls
// ---------------------------------------------------------------------------

describe('qr.service.getQr — QR stability', () => {
  it('returns the same qrToken on repeated calls for the same questionnaire', async () => {
    // The token comes from the DB row, not generated here. Stability is the DB's
    // @unique @default(cuid()) contract. Two calls with the same DB row → same token.
    mockFindById.mockResolvedValue(baseQuestionnaire)

    const first = await getQr(adminPrincipal, 'q_01')
    const second = await getQr(adminPrincipal, 'q_01')

    expect(first.qrToken).toBe(second.qrToken)
    expect(first.scanUrl).toBe(second.scanUrl)
  })
})

// ---------------------------------------------------------------------------
// QRCode.toString interaction
// ---------------------------------------------------------------------------

describe('qr.service.getQr — SVG rendering', () => {
  it('calls QRCode.toString with the scanUrl and type svg', async () => {
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)

    await getQr(adminPrincipal, 'q_01')

    expect(mockQRCodeToString).toHaveBeenCalledWith(
      'http://localhost:3000/scan/stable-token-123',
      expect.objectContaining({ type: 'svg' })
    )
  })

  it('returns the SVG string from QRCode.toString', async () => {
    const customSvg = '<svg><rect/></svg>'
    mockQRCodeToString.mockResolvedValueOnce(customSvg)
    mockFindById.mockResolvedValueOnce(baseQuestionnaire)

    const result = await getQr(adminPrincipal, 'q_01')
    expect(result.qrSvg).toBe(customSvg)
  })
})
