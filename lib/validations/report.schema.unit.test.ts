import { describe, it, expect } from 'vitest'
import {
  complianceQuerySchema,
  pendingQuerySchema,
  historyQuerySchema,
} from './report.schema'

describe('report.schema — complianceQuerySchema', () => {
  it('parses a valid single-day query (to defaults to from)', () => {
    const result = complianceQuerySchema.safeParse({ from: '2026-08-01' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.from).toBe('2026-08-01')
      expect(result.data.to).toBe('2026-08-01')
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
    }
  })

  it('parses a valid 31-day range (edge, inclusive)', () => {
    // from 2026-08-01 to 2026-08-31 = 30 days diff = 31 days inclusive → passes
    const result = complianceQuerySchema.safeParse({
      from: '2026-08-01',
      to: '2026-08-31',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a 62-day range with range_too_large', () => {
    const result = complianceQuerySchema.safeParse({
      from: '2026-07-01',
      to: '2026-09-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid date format (MM-DD-YYYY)', () => {
    const result = complianceQuerySchema.safeParse({ from: '08-01-2026' })
    expect(result.success).toBe(false)
  })

  it('rejects an impossible date (2026-02-30)', () => {
    const result = complianceQuerySchema.safeParse({ from: '2026-02-30' })
    expect(result.success).toBe(false)
  })

  it('rejects page=0', () => {
    const result = complianceQuerySchema.safeParse({
      from: '2026-08-01',
      page: '0',
    })
    expect(result.success).toBe(false)
  })

  it('rejects pageSize=101', () => {
    const result = complianceQuerySchema.safeParse({
      from: '2026-08-01',
      pageSize: '101',
    })
    expect(result.success).toBe(false)
  })

  it('rejects pageSize=-5', () => {
    const result = complianceQuerySchema.safeParse({
      from: '2026-08-01',
      pageSize: '-5',
    })
    expect(result.success).toBe(false)
  })

  it('passes through optional branchId and questionnaireId', () => {
    const result = complianceQuerySchema.safeParse({
      from: '2026-08-01',
      branchId: 'branch-123',
      questionnaireId: 'q-456',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.branchId).toBe('branch-123')
      expect(result.data.questionnaireId).toBe('q-456')
    }
  })

  it('rejects when to < from', () => {
    const result = complianceQuerySchema.safeParse({
      from: '2026-08-10',
      to: '2026-08-01',
    })
    expect(result.success).toBe(false)
  })
})

describe('report.schema — pendingQuerySchema', () => {
  it('parses a valid pending query', () => {
    const result = pendingQuerySchema.safeParse({ businessDay: '2026-08-01' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.businessDay).toBe('2026-08-01')
    }
  })

  it('rejects an invalid date', () => {
    const result = pendingQuerySchema.safeParse({ businessDay: 'not-a-date' })
    expect(result.success).toBe(false)
  })

  it('passes optional filters', () => {
    const result = pendingQuerySchema.safeParse({
      businessDay: '2026-08-01',
      branchId: 'b1',
      questionnaireId: 'q1',
    })
    expect(result.success).toBe(true)
  })
})

describe('report.schema — historyQuerySchema', () => {
  it('parses a valid history query with defaults', () => {
    const result = historyQuerySchema.safeParse({
      from: '2026-08-01',
      to: '2026-08-10',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.pageSize).toBe(20)
    }
  })

  it('rejects range > 31 days', () => {
    const result = historyQuerySchema.safeParse({
      from: '2026-07-01',
      to: '2026-09-01',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing to', () => {
    const result = historyQuerySchema.safeParse({ from: '2026-08-01' })
    expect(result.success).toBe(false)
  })

  it('passes optional filters (employeeId, questionnaireId, branchId)', () => {
    const result = historyQuerySchema.safeParse({
      from: '2026-08-01',
      to: '2026-08-10',
      employeeId: 'emp-1',
      questionnaireId: 'q-1',
      branchId: 'b-1',
      page: '2',
      pageSize: '50',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(2)
      expect(result.data.pageSize).toBe(50)
      expect(result.data.employeeId).toBe('emp-1')
    }
  })
})
