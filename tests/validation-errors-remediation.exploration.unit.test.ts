import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const VALIDATION_COMMANDS = [
  ['pnpm exec tsc --noEmit', ['exec', 'tsc', '--noEmit']],
  ['pnpm lint', ['lint']],
  ['pnpm build', ['build']],
] as const

interface ValidationRun {
  command: string
  exitStatus: number | null
  stderr: string
  stdout: string
  processError: string
}

const expectedBaselineCounterexamples = [
  'RequestInit mismatch at components/auth/password-change-form.tsx:174',
  'TypeScript errors across the documented ten-file inventory',
  'Lint errors and warnings, including Hooks-effect and empty-object-type diagnostics',
  'Build failure during TypeScript validation',
]

function runValidation(command: string, arguments_: readonly string[]): ValidationRun {
  const result = spawnSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    arguments_,
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }
  )

  return {
    command,
    exitStatus: result.status,
    stderr: result.stderr ?? '',
    stdout: result.stdout ?? '',
    processError: result.error?.message ?? '',
  }
}

function formatValidationReport(runs: readonly ValidationRun[]): string {
  return [
    'Validation command results:',
    ...runs.map((run) => {
      const nonZeroOutput = run.exitStatus === 0
        ? ''
        : `\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}\nprocess error:\n${run.processError}`

      return `${run.command} exited with ${run.exitStatus ?? 'no status'}${nonZeroOutput}`
    }),
    'Expected baseline counterexamples:',
    ...expectedBaselineCounterexamples.map((counterexample) => `- ${counterexample}`),
  ].join('\n')
}

describe('validation errors remediation baseline', () => {
  // **Validates: Requirements 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.3**
  it('requires each recorded validation command to exit successfully', () => {
    const runs = VALIDATION_COMMANDS.map(([command, arguments_]) =>
      runValidation(command, arguments_)
    )
    const report = formatValidationReport(runs)

    for (const run of runs) {
      console.info(`${run.command} exited with ${run.exitStatus ?? 'no status'}`)
      if (run.exitStatus !== 0) {
        console.error(report)
      }
    }

    expect(runs.map((run) => run.exitStatus), report).toEqual([0, 0, 0])
  }, 180_000)
})
