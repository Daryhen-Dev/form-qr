/**
 * Business timezone utilities for the America/Guayaquil timezone (UTC-5, no DST).
 *
 * Ecuador continental runs on a fixed UTC-5 offset year-round with no daylight
 * saving time transitions. The Galápagos Islands (UTC-6) are NOT in scope.
 *
 * This is the SINGLE source of truth for local-date derivation.
 * No other module may hardcode a timezone offset (XCUT-03).
 */

/** IANA timezone identifier for the business timezone. */
export const BUSINESS_TZ = 'America/Guayaquil'

/**
 * Fixed UTC offset in hours for America/Guayaquil (UTC-5, no DST).
 * A negative value means local time is behind UTC.
 */
export const BUSINESS_UTC_OFFSET_HOURS = -5

/**
 * Converts a UTC Date to the local YYYY-MM-DD calendar date in America/Guayaquil.
 *
 * Algorithm: shift the UTC timestamp by the fixed offset, then read the UTC
 * date parts of the shifted instant (which now represent the local date).
 *
 * Examples:
 *   2025-03-15T04:59:59.999Z → '2025-03-14'  (23:59:59.999 local, still prior day)
 *   2025-03-15T05:00:00.000Z → '2025-03-15'  (00:00:00.000 local, new day starts)
 *
 * @param date - The UTC instant to convert.
 * @returns ISO date string 'YYYY-MM-DD' in the local business timezone.
 */
export function utcToBusinessDay(date: Date): string {
  const shifted = new Date(date.getTime() + BUSINESS_UTC_OFFSET_HOURS * 3_600_000)
  return shifted.toISOString().slice(0, 10)
}

/**
 * Computes the UTC edit-window bounds for a given local businessDay.
 *
 * The window spans from 00:00:00.000 local to 23:59:59.999 local, expressed
 * in UTC. Because America/Guayaquil is UTC-5, midnight local = 05:00:00 UTC.
 *
 * Window bounds:
 *   startUtc = {businessDay}T05:00:00.000Z  (00:00:00.000 local)
 *   endUtc   = startUtc + 24h - 1ms         (23:59:59.999 local)
 *
 * A response is editable if and only if now <= endUtc.
 *
 * @param businessDay - Local calendar date in 'YYYY-MM-DD' format.
 * @returns Object with startUtc and endUtc as Date instances (UTC).
 */
export function businessDayWindowUtc(businessDay: string): { startUtc: Date; endUtc: Date } {
  // 00:00:00 local = 05:00:00 UTC (because UTC-5 → add 5h to get UTC)
  const startUtc = new Date(`${businessDay}T05:00:00.000Z`)
  // 23:59:59.999 local = startUtc + 24h - 1ms
  const endUtc = new Date(startUtc.getTime() + 24 * 3_600_000 - 1)
  return { startUtc, endUtc }
}
