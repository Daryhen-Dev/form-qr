import 'server-only'
import bcrypt from 'bcryptjs'

/** bcrypt cost factor — 12 for production; tests may mock this module entirely. */
const COST_FACTOR = 12

/**
 * Hashes a raw password using bcrypt (cost factor 12).
 * The returned hash is safe to persist; it is NEVER the raw password.
 */
export async function hash(password: string): Promise<string> {
  return bcrypt.hash(password, COST_FACTOR)
}

/**
 * Verifies a raw password against a stored bcrypt hash.
 * Returns true when the password matches, false otherwise.
 */
export async function verify(password: string, storedHash: string): Promise<boolean> {
  return bcrypt.compare(password, storedHash)
}
