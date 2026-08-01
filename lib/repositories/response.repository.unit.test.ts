/**
 * Unit tests for response.repository.ts
 *
 * Mocks the Prisma client (via lib/db) and verifies:
 * - createWithAnswers: atomic transaction, returns row, maps P2002 → ServiceError(409)
 * - findByUserQuestionnaireDay: passes correct filter args
 * - findById: filters active records and includes answers
 *
 * Run with: pnpm test --project unit
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock the database module — must be declared before importing the module under test
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(),
    response: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/db'
import {
  createWithAnswers,
  findByUserQuestionnaireDay,
  findById,
} from './response.repository'
import type { CreateResponseData, AnswerData } from './response.repository'

const mockTransaction = vi.mocked(prisma.$transaction)
const mockFindFirst = vi.mocked(prisma.response.findFirst)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseResponseData: CreateResponseData = {
  questionnaireId: 'q_01',
  versionId: 'v_01',
  userId: 'emp_01',
  businessDay: new Date('2025-03-15T00:00:00.000Z'), // stored as DATE
}

const baseAnswers: AnswerData[] = [
  { questionId: 'qn_01', value: true },
  { questionId: 'qn_02', value: 4 },
]

const baseResponseRow = {
  id: 'resp_01',
  questionnaireId: 'q_01',
  versionId: 'v_01',
  userId: 'emp_01',
  businessDay: new Date('2025-03-15'),
  createdAt: new Date('2025-03-15T10:00:00Z'),
  submittedAt: null,
  updatedAt: new Date('2025-03-15T10:00:00Z'),
  deletedAt: null,
}

const baseAnswerRows = [
  { id: 'ans_01', responseId: 'resp_01', questionId: 'qn_01', value: true },
  { id: 'ans_02', responseId: 'resp_01', questionId: 'qn_02', value: 4 },
]

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// createWithAnswers
// ---------------------------------------------------------------------------

describe('response.repository.createWithAnswers', () => {
  it('executes inside a $transaction', async () => {
    mockTransaction.mockImplementation(async (fn: Parameters<typeof prisma.$transaction>[0]) => {
      const mockTx = {
        response: { create: vi.fn().mockResolvedValue(baseResponseRow) },
        answer: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      }
      return (fn as (tx: unknown) => Promise<unknown>)(mockTx)
    })

    await createWithAnswers(baseResponseData, baseAnswers)
    expect(mockTransaction).toHaveBeenCalledOnce()
  })

  it('returns the created response row', async () => {
    mockTransaction.mockImplementation(async (fn: Parameters<typeof prisma.$transaction>[0]) => {
      const mockTx = {
        response: { create: vi.fn().mockResolvedValue(baseResponseRow) },
        answer: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
      }
      return (fn as (tx: unknown) => Promise<unknown>)(mockTx)
    })

    const result = await createWithAnswers(baseResponseData, baseAnswers)
    expect(result.id).toBe('resp_01')
    expect(result.userId).toBe('emp_01')
    expect(result.questionnaireId).toBe('q_01')
  })

  it('maps Prisma P2002 on businessDay unique constraint to ServiceError(409)', async () => {
    const p2002Error = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
    })
    mockTransaction.mockRejectedValueOnce(p2002Error)

    await expect(createWithAnswers(baseResponseData, baseAnswers)).rejects.toMatchObject({
      statusCode: 409,
      message: 'response_exists',
    })
  })

  it('does not swallow non-P2002 errors', async () => {
    const dbError = new Error('connection lost')
    mockTransaction.mockRejectedValueOnce(dbError)

    await expect(createWithAnswers(baseResponseData, baseAnswers)).rejects.toThrow(
      'connection lost'
    )
  })

  it('works with empty answers array (atomic create + createMany with 0 items)', async () => {
    mockTransaction.mockImplementation(async (fn: Parameters<typeof prisma.$transaction>[0]) => {
      const mockTx = {
        response: { create: vi.fn().mockResolvedValue(baseResponseRow) },
        answer: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }
      return (fn as (tx: unknown) => Promise<unknown>)(mockTx)
    })

    const result = await createWithAnswers(baseResponseData, [])
    expect(result.id).toBe('resp_01')
  })
})

// ---------------------------------------------------------------------------
// findByUserQuestionnaireDay
// ---------------------------------------------------------------------------

describe('response.repository.findByUserQuestionnaireDay', () => {
  it('returns a response row when found', async () => {
    mockFindFirst.mockResolvedValueOnce({ ...baseResponseRow, answers: baseAnswerRows } as never)

    const result = await findByUserQuestionnaireDay('emp_01', 'q_01', new Date('2025-03-15'))
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('emp_01')
  })

  it('returns null when no response found', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const result = await findByUserQuestionnaireDay('emp_01', 'q_01', new Date('2025-03-15'))
    expect(result).toBeNull()
  })

  it('calls prisma.response.findFirst with correct filter args', async () => {
    mockFindFirst.mockResolvedValueOnce(null)
    const businessDay = new Date('2025-03-15')

    await findByUserQuestionnaireDay('emp_01', 'q_01', businessDay)

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'emp_01',
          questionnaireId: 'q_01',
          deletedAt: null,
        }),
      })
    )
  })
})

// ---------------------------------------------------------------------------
// findById
// ---------------------------------------------------------------------------

describe('response.repository.findById', () => {
  it('returns null when response not found', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    const result = await findById('resp_missing')
    expect(result).toBeNull()
  })

  it('returns the response with answers when found', async () => {
    mockFindFirst.mockResolvedValueOnce({ ...baseResponseRow, answers: baseAnswerRows } as never)

    const result = await findById('resp_01')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('resp_01')
  })

  it('filters soft-deleted responses (deletedAt: null)', async () => {
    mockFindFirst.mockResolvedValueOnce(null)

    await findById('resp_deleted')

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'resp_deleted',
          deletedAt: null,
        }),
      })
    )
  })
})
