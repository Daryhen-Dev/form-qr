/**
 * Integration test for health.repository — RED phase.
 * Requires the form_qr_test database to be running.
 * Run with: pnpm test --project integration
 */
import { describe, expect, it } from 'vitest'
import { ping } from './health.repository'

describe('health.repository', () => {
  it('ping returns a now field that is a Date', async () => {
    const result = await ping()
    expect(result).toHaveProperty('now')
    expect(result.now).toBeInstanceOf(Date)
  })

  it('ping returns a timestamp within 5 seconds of the current time', async () => {
    const before = new Date()
    const result = await ping()
    const after = new Date()

    expect(result.now.getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000)
    expect(result.now.getTime()).toBeLessThanOrEqual(after.getTime() + 5000)
  })
})
