import { describe, expect, it } from 'vitest'

import {
  buildComplianceQuery,
  buildHistoryQuery,
  buildPendingQuery,
  isRealCalendarDate,
  isValidPage,
  isValidPageSize,
  isWithinAllowedRange,
} from '@/lib/operational-api/report-query'

function parse(query: string): URLSearchParams {
  return new URLSearchParams(query.startsWith('?') ? query.slice(1) : query)
}

describe('isRealCalendarDate', () => {
  it('accepts real calendar days in YYYY-MM-DD form', () => {
    expect(isRealCalendarDate('2024-02-29')).toBe(true)
    expect(isRealCalendarDate('2024-01-01')).toBe(true)
  })

  it('rejects unreal or malformed dates', () => {
    expect(isRealCalendarDate('2023-02-29')).toBe(false) // not a leap year
    expect(isRealCalendarDate('2024-13-01')).toBe(false)
    expect(isRealCalendarDate('2024-00-10')).toBe(false)
    expect(isRealCalendarDate('2024-1-1')).toBe(false)
    expect(isRealCalendarDate('not-a-date')).toBe(false)
    expect(isRealCalendarDate('')).toBe(false)
  })
})

describe('isWithinAllowedRange', () => {
  it('accepts inclusive ranges of at most 31 days', () => {
    expect(isWithinAllowedRange('2024-01-01', '2024-01-01')).toBe(true)
    expect(isWithinAllowedRange('2024-01-01', '2024-01-31')).toBe(true) // 31 inclusive
  })

  it('rejects ranges over 31 days or inverted', () => {
    expect(isWithinAllowedRange('2024-01-01', '2024-02-01')).toBe(false) // 32 inclusive
    expect(isWithinAllowedRange('2024-01-31', '2024-01-01')).toBe(false) // to < from
  })
})

describe('pagination guards', () => {
  it('validates page and pageSize bounds', () => {
    expect(isValidPage(1)).toBe(true)
    expect(isValidPage(0)).toBe(false)
    expect(isValidPage(1.5)).toBe(false)
    expect(isValidPageSize(1)).toBe(true)
    expect(isValidPageSize(100)).toBe(true)
    expect(isValidPageSize(101)).toBe(false)
    expect(isValidPageSize(0)).toBe(false)
  })
})

describe('buildPendingQuery', () => {
  it('requires businessDay and emits only allowed params', () => {
    const result = buildPendingQuery({
      businessDay: '2024-01-15',
      branchId: 'b1',
      questionnaireId: 'q1',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const params = parse(result.query)
    expect(params.get('businessDay')).toBe('2024-01-15')
    expect(params.get('branchId')).toBe('b1')
    expect(params.get('questionnaireId')).toBe('q1')
    expect([...params.keys()].sort()).toEqual([
      'branchId',
      'businessDay',
      'questionnaireId',
    ])
  })

  it('omits empty optional filters', () => {
    const result = buildPendingQuery({ businessDay: '2024-01-15', branchId: '' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const params = parse(result.query)
    expect(params.has('branchId')).toBe(false)
  })

  it('reports invalid businessDay', () => {
    const result = buildPendingQuery({ businessDay: '2023-02-29' })
    expect(result).toEqual({ ok: false, invalidFields: ['businessDay'] })
  })
})

describe('buildComplianceQuery', () => {
  it('requires from and emits allowed params including pagination', () => {
    const result = buildComplianceQuery({
      from: '2024-01-01',
      to: '2024-01-15',
      branchId: 'b1',
      questionnaireId: 'q1',
      page: 2,
      pageSize: 50,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const params = parse(result.query)
    expect(params.get('from')).toBe('2024-01-01')
    expect(params.get('to')).toBe('2024-01-15')
    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('50')
    expect([...params.keys()]).not.toContain('employeeId')
  })

  it('omits to when not provided', () => {
    const result = buildComplianceQuery({ from: '2024-01-01' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(parse(result.query).has('to')).toBe(false)
  })

  it('rejects a range over 31 days', () => {
    const result = buildComplianceQuery({ from: '2024-01-01', to: '2024-02-05' })
    expect(result).toEqual({ ok: false, invalidFields: ['to'] })
  })

  it('rejects invalid pagination', () => {
    const result = buildComplianceQuery({
      from: '2024-01-01',
      page: 0,
      pageSize: 999,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.invalidFields).toEqual(['page', 'pageSize'])
  })
})

describe('buildHistoryQuery', () => {
  it('requires from and to and emits only allowed params', () => {
    const result = buildHistoryQuery({
      from: '2024-01-01',
      to: '2024-01-10',
      employeeId: 'e1',
      questionnaireId: 'q1',
      branchId: 'b1',
      page: 1,
      pageSize: 20,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const params = parse(result.query)
    expect([...params.keys()].sort()).toEqual([
      'branchId',
      'employeeId',
      'from',
      'page',
      'pageSize',
      'questionnaireId',
      'to',
    ])
  })

  it('reports both missing dates as invalid', () => {
    const result = buildHistoryQuery({ from: 'bad', to: '' })
    expect(result).toEqual({ ok: false, invalidFields: ['from', 'to'] })
  })

  it('rejects an inverted range', () => {
    const result = buildHistoryQuery({ from: '2024-01-31', to: '2024-01-01' })
    expect(result).toEqual({ ok: false, invalidFields: ['to'] })
  })
})
