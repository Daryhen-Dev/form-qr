import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'
import { config as dotenvConfig } from 'dotenv'

// Load .env for test environment variables (TEST_DATABASE_URL etc.)
dotenvConfig()

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.unit.test.ts'],
          exclude: ['node_modules/**'],
          setupFiles: ['tests/setup.unit.ts'],
          env: {
            NODE_ENV: 'test',
          },
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: 'integration',
          environment: 'node',
          include: ['**/*.integration.test.ts'],
          exclude: ['node_modules/**'],
          setupFiles: ['tests/setup.integration.ts'],
          env: {
            NODE_ENV: 'test',
            // Override DATABASE_URL so that the lib/db PrismaClient singleton
            // connects to the test database (form_qr_test) rather than the dev
            // database (form_qr). Without this, lib/db and tests/setup.integration.ts
            // would target different databases: lib/db would truncate nothing while
            // reading from the dev DB, breaking every future data-touching test.
            DATABASE_URL: process.env.TEST_DATABASE_URL,
          },
        },
      },
    ],
  },
})
