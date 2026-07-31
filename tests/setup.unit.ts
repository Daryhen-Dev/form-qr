/**
 * Unit test setup — mocks server-only so backend modules can be tested
 * in Node.js without the Next.js server boundary check.
 */
import { vi } from 'vitest'

vi.mock('server-only', () => ({}))
