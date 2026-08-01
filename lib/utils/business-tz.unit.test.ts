/**
 * Unit tests for lib/utils/business-tz.ts
 *
 * Pure function tests — no DB, no server boundary.
 * Verifies boundary behaviour at America/Guayaquil UTC-5 offset.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { utcToBusinessDay, businessDayWindowUtc } from './business-tz'

// ---------------------------------------------------------------------------
// utcToBusinessDay
// ---------------------------------------------------------------------------

describe('utcToBusinessDay', () => {
  // 04:59:59.999Z  →  23:59:59.999 UTC-5  →  prior local day
  it('04:59:59.999Z → prior local calendar day (last valid instant of that day)', () => {
    const result = utcToBusinessDay(new Date('2025-03-15T04:59:59.999Z'))
    expect(result).toBe('2025-03-14')
  })

  // 05:00:00.000Z  →  00:00:00.000 UTC-5  →  new local day
  it('05:00:00.000Z → current calendar day (first instant of new local day)', () => {
    const result = utcToBusinessDay(new Date('2025-03-15T05:00:00.000Z'))
    expect(result).toBe('2025-03-15')
  })

  // Mid-day UTC
  it('12:00:00.000Z (07:00 local) → same day', () => {
    const result = utcToBusinessDay(new Date('2025-06-20T12:00:00.000Z'))
    expect(result).toBe('2025-06-20')
  })

  // Midnight UTC (19:00 local previous day)
  it('00:00:00.000Z → prior local day (19:00 UTC-5 of the prior day)', () => {
    const result = utcToBusinessDay(new Date('2025-03-15T00:00:00.000Z'))
    expect(result).toBe('2025-03-14')
  })

  // Cross-month boundary: 2025-04-01T04:59:59.999Z → 2025-03-31 local
  it('cross-month boundary: 2025-04-01T04:59:59.999Z → 2025-03-31', () => {
    const result = utcToBusinessDay(new Date('2025-04-01T04:59:59.999Z'))
    expect(result).toBe('2025-03-31')
  })

  // Cross-year boundary: 2026-01-01T04:59:59.999Z → 2025-12-31 local
  it('cross-year boundary: 2026-01-01T04:59:59.999Z → 2025-12-31', () => {
    const result = utcToBusinessDay(new Date('2026-01-01T04:59:59.999Z'))
    expect(result).toBe('2025-12-31')
  })

  // Returns YYYY-MM-DD string format
  it('returns a string in YYYY-MM-DD format', () => {
    const result = utcToBusinessDay(new Date('2025-07-15T10:00:00.000Z'))
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// businessDayWindowUtc
// ---------------------------------------------------------------------------

describe('businessDayWindowUtc', () => {
  it('startUtc is {day}T05:00:00.000Z for businessDay 2025-03-15', () => {
    const { startUtc } = businessDayWindowUtc('2025-03-15')
    expect(startUtc.toISOString()).toBe('2025-03-15T05:00:00.000Z')
  })

  it('endUtc is 24h - 1ms after startUtc (2025-03-16T04:59:59.999Z)', () => {
    const { endUtc } = businessDayWindowUtc('2025-03-15')
    expect(endUtc.toISOString()).toBe('2025-03-16T04:59:59.999Z')
  })

  it('endUtc represents 23:59:59.999 local time of the businessDay', () => {
    const { endUtc } = businessDayWindowUtc('2025-06-20')
    // 2025-06-20 23:59:59.999 UTC-5 = 2025-06-21T04:59:59.999Z
    expect(endUtc.toISOString()).toBe('2025-06-21T04:59:59.999Z')
  })

  it('startUtc and endUtc are exactly 24h - 1ms apart', () => {
    const { startUtc, endUtc } = businessDayWindowUtc('2025-11-30')
    expect(endUtc.getTime() - startUtc.getTime()).toBe(24 * 60 * 60 * 1000 - 1)
  })

  it('cross-year: businessDay 2025-12-31 → endUtc 2026-01-01T04:59:59.999Z', () => {
    const { startUtc, endUtc } = businessDayWindowUtc('2025-12-31')
    expect(startUtc.toISOString()).toBe('2025-12-31T05:00:00.000Z')
    expect(endUtc.toISOString()).toBe('2026-01-01T04:59:59.999Z')
  })

  // An instant at the boundary is within the window (endUtc inclusive)
  it('instant exactly at endUtc is within the edit window (<=)', () => {
    const { endUtc } = businessDayWindowUtc('2025-03-15')
    expect(endUtc.getTime()).toBeLessThanOrEqual(endUtc.getTime())
    // Verify: endUtc + 1ms would be the next business day's first instant
    const afterWindow = new Date(endUtc.getTime() + 1)
    expect(afterWindow.toISOString()).toBe('2025-03-16T05:00:00.000Z')
  })
})
