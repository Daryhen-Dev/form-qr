/**
 * Unit test for health.service — RED phase.
 * Stubs the repository so no DB connection is needed.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the repository before importing the service
vi.mock('@/lib/repositories/health.repository', () => ({
  ping: vi.fn(),
}))

import { ping } from '@/lib/repositories/health.repository'
import { checkHealth } from './health.service'

const mockPing = vi.mocked(ping)

describe('health.service.checkHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns status ok with a UTC ISO timestamp when ping succeeds', async () => {
    const fakeDate = new Date('2024-01-15T10:30:00.000Z')
    mockPing.mockResolvedValueOnce({ now: fakeDate })

    const result = await checkHealth()

    expect(result.status).toBe('ok')
    expect(result.timestamp).toBe(fakeDate.toISOString())
  })

  it('propagates errors from ping so the handler can return 503', async () => {
    mockPing.mockRejectedValueOnce(new Error('Connection refused'))

    await expect(checkHealth()).rejects.toThrow('Connection refused')
  })
})
