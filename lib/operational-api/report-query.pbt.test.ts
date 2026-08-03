import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  MAX_RANGE_DAYS,
  buildComplianceQuery,
  buildHistoryQuery,
  buildPendingQuery,
  isRealCalendarDate,
  isValidPage,
  isValidPageSize,
  isWithinAllowedRange,
  type ComplianceQueryInput,
  type HistoryQueryInput,
  type PendingQueryInput,
  type ReportQueryResult,
} from '@/lib/operational-api/report-query'

// Feature: operational-web-application, Property 5: Consultas de reporte válidas
// **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.6**
//
// Para toda entrada, sólo fechas reales y rangos inclusivos <=31 días producen
// los parámetros permitidos por endpoint; la paginación sólo ofrece páginas y
// tamaños válidos; y ninguna query contiene parámetros ajenos.

const PENDING_ALLOWED_KEYS = ['businessDay', 'branchId', 'questionnaireId']
const COMPLIANCE_ALLOWED_KEYS = [
  'from',
  'to',
  'branchId',
  'questionnaireId',
  'page',
  'pageSize',
]
const HISTORY_ALLOWED_KEYS = [
  'from',
  'to',
  'employeeId',
  'questionnaireId',
  'branchId',
  'page',
  'pageSize',
]

const PENDING_INVALIDABLE = new Set(['businessDay'])
const RANGE_INVALIDABLE = new Set(['from', 'to', 'page', 'pageSize'])

// --- Generators ---------------------------------------------------------------

/** Real calendar days as YYYY-MM-DD, spanning a wide but realistic window. */
const realDateArbitrary = fc
  .date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2100-12-31T00:00:00.000Z'),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString().slice(0, 10))

/** Well-formed YYYY-MM-DD strings that are NOT real calendar days. */
const unrealDateArbitrary = fc.constantFrom(
  '2024-02-30',
  '2023-02-29',
  '2024-13-01',
  '2024-00-10',
  '2024-01-32',
  '2024-04-31',
  '2024-11-31',
  '0000-00-00'
)

/** Strings that do not match the YYYY-MM-DD shape at all. */
const malformedDateArbitrary = fc.oneof(
  fc.constant(''),
  fc.constant('2024-1-1'),
  fc.constant('2024/01/01'),
  fc.constant('01-01-2024'),
  fc.constant('not-a-date'),
  fc.string({ maxLength: 12 })
)

/** Mixed date input: mostly real, plus unreal and malformed values. */
const dateInputArbitrary = fc.oneof(
  { weight: 6, arbitrary: realDateArbitrary },
  { weight: 2, arbitrary: unrealDateArbitrary },
  { weight: 2, arbitrary: malformedDateArbitrary }
)

/** Optional string filter: omitted (undefined), empty, or a concrete value. */
const optionalFilterArbitrary = fc.oneof(
  fc.constant<string | undefined>(undefined),
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 12 })
)

/** Optional pagination value: omitted, valid, out-of-range, or non-integer. */
const optionalPageArbitrary = fc.oneof(
  fc.constant<number | undefined>(undefined),
  fc.integer({ min: -3, max: 130 }),
  fc.constantFrom(1.5, 2.75, 0.1)
)

/** True when an optional filter carries a value the builder should send. */
function hasFilterValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseQueryKeys(query: string): string[] {
  return [...new URLSearchParams(query).keys()]
}

function pageIsAcceptable(page: number | undefined): boolean {
  return page === undefined || isValidPage(page)
}

function pageSizeIsAcceptable(pageSize: number | undefined): boolean {
  return pageSize === undefined || isValidPageSize(pageSize)
}

function expectAllowedKeys(query: string, allowed: readonly string[]): void {
  for (const key of parseQueryKeys(query)) {
    expect(allowed).toContain(key)
  }
}

function expectInvalidFieldsSubset(
  result: Extract<ReportQueryResult, { ok: false }>,
  invalidable: ReadonlySet<string>
): void {
  expect(result.invalidFields.length).toBeGreaterThan(0)
  for (const field of result.invalidFields) {
    expect(invalidable.has(field)).toBe(true)
  }
}

// --- Property 5 ---------------------------------------------------------------

describe('Property 5: valid report queries', () => {
  it('produces only allowed parameters for real dates, capped ranges, and valid pagination', () => {
    // --- Pending: businessDay required; branchId/questionnaireId optional -----
    fc.assert(
      fc.property(
        fc.record({
          businessDay: dateInputArbitrary,
          branchId: optionalFilterArbitrary,
          questionnaireId: optionalFilterArbitrary,
        }),
        (input: PendingQueryInput) => {
          const result = buildPendingQuery(input)
          const businessDayValid = isRealCalendarDate(input.businessDay)

          expect(result.ok).toBe(businessDayValid)

          if (!result.ok) {
            expectInvalidFieldsSubset(result, PENDING_INVALIDABLE)
            expect(result.invalidFields).toContain('businessDay')
            return
          }

          const keys = parseQueryKeys(result.query)
          expectAllowedKeys(result.query, PENDING_ALLOWED_KEYS)
          expect(keys).toContain('businessDay')
          expect(
            new URLSearchParams(result.query).get('businessDay')
          ).toBe(input.businessDay)
          expect(keys.includes('branchId')).toBe(hasFilterValue(input.branchId))
          expect(keys.includes('questionnaireId')).toBe(
            hasFilterValue(input.questionnaireId)
          )
        }
      ),
      { numRuns: 100 }
    )

    // --- Compliance: from required; to optional (<=31d); page/pageSize --------
    fc.assert(
      fc.property(
        fc.record({
          from: dateInputArbitrary,
          to: fc.option(dateInputArbitrary, { nil: undefined }),
          branchId: optionalFilterArbitrary,
          questionnaireId: optionalFilterArbitrary,
          page: optionalPageArbitrary,
          pageSize: optionalPageArbitrary,
        }),
        (input: ComplianceQueryInput) => {
          const result = buildComplianceQuery(input)

          const fromValid = isRealCalendarDate(input.from)
          const toAcceptable =
            input.to === undefined ||
            (isRealCalendarDate(input.to) &&
              fromValid &&
              isWithinAllowedRange(input.from, input.to))
          const expectedOk =
            fromValid &&
            toAcceptable &&
            pageIsAcceptable(input.page) &&
            pageSizeIsAcceptable(input.pageSize)

          expect(result.ok).toBe(expectedOk)

          if (!result.ok) {
            expectInvalidFieldsSubset(result, RANGE_INVALIDABLE)
            return
          }

          const keys = parseQueryKeys(result.query)
          expectAllowedKeys(result.query, COMPLIANCE_ALLOWED_KEYS)
          expect(keys).toContain('from')
          expect(keys.includes('to')).toBe(input.to !== undefined)
          expect(keys.includes('page')).toBe(input.page !== undefined)
          expect(keys.includes('pageSize')).toBe(input.pageSize !== undefined)

          if (input.to !== undefined) {
            expect(isWithinAllowedRange(input.from, input.to)).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )

    // --- History: from + to required (<=31d); page/pageSize -------------------
    fc.assert(
      fc.property(
        fc.record({
          from: dateInputArbitrary,
          to: dateInputArbitrary,
          employeeId: optionalFilterArbitrary,
          questionnaireId: optionalFilterArbitrary,
          branchId: optionalFilterArbitrary,
          page: optionalPageArbitrary,
          pageSize: optionalPageArbitrary,
        }),
        (input: HistoryQueryInput) => {
          const result = buildHistoryQuery(input)

          const rangeValid =
            isRealCalendarDate(input.from) &&
            isRealCalendarDate(input.to) &&
            isWithinAllowedRange(input.from, input.to)
          const expectedOk =
            rangeValid &&
            pageIsAcceptable(input.page) &&
            pageSizeIsAcceptable(input.pageSize)

          expect(result.ok).toBe(expectedOk)

          if (!result.ok) {
            expectInvalidFieldsSubset(result, RANGE_INVALIDABLE)
            return
          }

          const keys = parseQueryKeys(result.query)
          expectAllowedKeys(result.query, HISTORY_ALLOWED_KEYS)
          expect(keys).toContain('from')
          expect(keys).toContain('to')
          expect(isWithinAllowedRange(input.from, input.to)).toBe(true)
          expect(keys.includes('employeeId')).toBe(
            hasFilterValue(input.employeeId)
          )
          expect(keys.includes('page')).toBe(input.page !== undefined)
          expect(keys.includes('pageSize')).toBe(input.pageSize !== undefined)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('grounds the date and range helpers the builders rely on', () => {
    // Real dates round-trip; ranges beyond MAX_RANGE_DAYS or reversed are rejected.
    fc.assert(
      fc.property(realDateArbitrary, fc.integer({ min: 0, max: 120 }), (from, offsetDays) => {
        expect(isRealCalendarDate(from)).toBe(true)

        const fromMs = Date.parse(`${from}T00:00:00.000Z`)
        const to = new Date(fromMs + offsetDays * 86_400_000)
          .toISOString()
          .slice(0, 10)

        const inclusiveDays = offsetDays + 1
        expect(isWithinAllowedRange(from, to)).toBe(inclusiveDays <= MAX_RANGE_DAYS)

        if (offsetDays > 0) {
          // Reversed range (to before from) is never allowed.
          expect(isWithinAllowedRange(to, from)).toBe(false)
        }
      }),
      { numRuns: 100 }
    )
  })
})
