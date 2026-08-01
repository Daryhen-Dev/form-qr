/**
 * Unit tests for answer.repository.ts
 *
 * Mocks the Prisma client and verifies:
 * - createManyForResponse: delegates to createMany with correct data
 * - findByResponse: queries with responseId filter
 *
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: {
    answer: {
      createMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import { createManyForResponse, findByResponse } from './answer.repository'

const mockCreateMany = vi.mocked(prisma.answer.createMany)
const mockFindMany = vi.mocked(prisma.answer.findMany)

const baseAnswerRows = [
  { id: 'ans_01', responseId: 'resp_01', questionId: 'qn_01', value: true },
  { id: 'ans_02', responseId: 'resp_01', questionId: 'qn_02', value: 4 },
]

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// createManyForResponse
// ---------------------------------------------------------------------------

describe('answer.repository.createManyForResponse', () => {
  it('calls createMany with correct data', async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 2 })

    await createManyForResponse('resp_01', [
      { questionId: 'qn_01', value: true },
      { questionId: 'qn_02', value: 4 },
    ])

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { responseId: 'resp_01', questionId: 'qn_01', value: true },
        { responseId: 'resp_01', questionId: 'qn_02', value: 4 },
      ],
    })
  })

  it('handles empty answers array without error', async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 0 })

    await createManyForResponse('resp_01', [])

    expect(mockCreateMany).toHaveBeenCalledWith({ data: [] })
  })

  it('returns the count of created records', async () => {
    mockCreateMany.mockResolvedValueOnce({ count: 3 })

    const result = await createManyForResponse('resp_01', [
      { questionId: 'qn_01', value: 'A' },
      { questionId: 'qn_02', value: true },
      { questionId: 'qn_03', value: 5 },
    ])

    expect(result.count).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// findByResponse
// ---------------------------------------------------------------------------

describe('answer.repository.findByResponse', () => {
  it('returns all answers for the given responseId', async () => {
    mockFindMany.mockResolvedValueOnce(baseAnswerRows as never)

    const result = await findByResponse('resp_01')

    expect(result).toHaveLength(2)
    expect(result[0].responseId).toBe('resp_01')
  })

  it('calls findMany with correct responseId filter', async () => {
    mockFindMany.mockResolvedValueOnce([])

    await findByResponse('resp_42')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { responseId: 'resp_42' },
      })
    )
  })

  it('returns empty array when no answers found', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const result = await findByResponse('resp_empty')
    expect(result).toEqual([])
  })
})
