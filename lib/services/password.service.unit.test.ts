/**
 * Unit tests for password.service — RED phase.
 * Tests that hash/verify work correctly without touching the DB.
 * Run with: pnpm test --project unit
 */
import { describe, expect, it } from 'vitest'
import { hash, verify } from './password.service'

describe('password.service', () => {
  // Use a low cost factor in tests to keep them fast (cost=4 instead of 12)
  // The actual implementation uses cost=12; tests just need to verify the roundtrip contract.

  it('hash returns a non-empty string', async () => {
    const result = await hash('mypassword')
    expect(result).toBeTruthy()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('hash result is NOT equal to the raw password', async () => {
    const raw = 'mypassword'
    const hashed = await hash(raw)
    expect(hashed).not.toBe(raw)
  })

  it('verify returns true for correct password + its hash', async () => {
    const raw = 'correctpassword'
    const hashed = await hash(raw)
    const result = await verify(raw, hashed)
    expect(result).toBe(true)
  })

  it('verify returns false for wrong password against a hash', async () => {
    const raw = 'correctpassword'
    const hashed = await hash(raw)
    const result = await verify('wrongpassword', hashed)
    expect(result).toBe(false)
  })

  it('two calls to hash with the same input produce different hashes (salt randomness)', async () => {
    const raw = 'samepassword'
    const hash1 = await hash(raw)
    const hash2 = await hash(raw)
    expect(hash1).not.toBe(hash2)
    // But both verify correctly
    expect(await verify(raw, hash1)).toBe(true)
    expect(await verify(raw, hash2)).toBe(true)
  })
})
