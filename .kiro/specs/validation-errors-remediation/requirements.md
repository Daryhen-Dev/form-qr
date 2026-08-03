# Requirements Document

## Introduction

This bugfix remediates reproducible TypeScript, lint, and production-build validation failures. The acceptance source of truth is CLI output: the baseline run passed `pnpm test` (59 files, 742 tests), while `pnpm exec tsc --noEmit` reported 33 errors in 10 files, `pnpm lint` reported 12 errors and 9 warnings, and `pnpm build` failed during TypeScript validation. Editor diagnostics alone are not sufficient acceptance evidence.

## Glossary

- **CLI validation**: The test, type-check, lint, and build commands specified in the acceptance criteria.
- **Bug-condition exploration test**: A pre-repair check that deliberately demonstrates the recorded validation failure.

## Requirements

### 1. Reproducible Validation Evidence

1.1 WHEN validating the remediation, THE system SHALL execute `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` once each and SHALL determine that command-line validation has passed only when all four commands exit with status 0; otherwise, it SHALL determine that command-line validation has failed and retain the exit status and output of every command that exits with a non-zero status.

1.2 WHEN the unrepaired baseline is evaluated, THE system SHALL mark the bug-condition exploration test as failed if and only if at least one execution of `pnpm exec tsc --noEmit`, `pnpm lint`, or `pnpm build` exits with a non-zero status, and SHALL identify each command with a non-zero exit status in the test output.

1.3 WHEN an editor reports zero diagnostics for every file changed by the remediation, THE system SHALL record the editor result separately and SHALL determine command-line validation status only according to criterion 1.1.

### 2. Bug Conditions and Correct Behavior

2.1 WHEN `pnpm exec tsc --noEmit` evaluates the project, THE System SHALL exit with status `0` and report exactly `0` TypeScript errors, including errors caused by passing `ChangePasswordRequest.headers` as `RequestInit` in `components/auth/password-change-form.tsx`.

2.2 WHEN `pnpm exec tsc --noEmit` evaluates the affected tests and authentication code, THE System SHALL report exactly `0` TypeScript errors caused by invalid mock typings, invalid tuple typings, or login-field literals that do not match their declared types.

2.3 WHEN `pnpm exec tsc --noEmit` evaluates `lib/operational-ui/routes.ts`, THE System SHALL report exactly `0` TypeScript errors in that file.

2.4 WHEN `pnpm lint` evaluates the project, THE System SHALL exit with status `0` and report exactly `0` lint errors and exactly `0` lint warnings, including `react-hooks/set-state-in-effect` diagnostics in login and operational UI components and `@typescript-eslint/no-empty-object-type` diagnostics in `lib/operational-api/contracts.ts`.

2.5 WHEN `pnpm build` performs production compilation and TypeScript validation, THE System SHALL exit with status `0` and report exactly `0` TypeScript errors, including errors at `components/auth/password-change-form.tsx:174`.

### 3. Non-Regression Constraints

3.1 WHEN `pnpm test` is executed once after remediation, THE System SHALL exit with status `0`, report no failed test files or tests, and report at least 59 passing test files and 742 passing tests.

3.2 WHEN an existing automated test runs a password-change, login, or operational UI flow with an input that passed in the pre-remediation baseline, THE System SHALL produce the result asserted by that test without a runtime exception.

3.3 WHEN an existing automated test supplies a request option, test mock, tuple value, login field, or operational route state that passed in the pre-remediation baseline, THE System SHALL complete without a runtime exception or a type error.

### 4. Scope Boundaries

4.1 WHEN each stated validation command is executed against the remediation, THE remediation SHALL cause each command to complete with exit code 0 using only source, test, type, and lint changes required to correct defects identified by those commands.

4.2 IF a proposed change neither corrects a defect identified by a stated validation command nor is required for every stated validation command to complete with exit code 0, THEN THE remediation SHALL NOT change product requirements, public API contracts, authentication semantics, or operational UI behavior.

4.3 WHEN correcting a defect identified by a stated validation command, THE remediation SHALL NOT add or modify a configuration, directive, or command option that suppresses, ignores, disables, or excludes a TypeScript, lint, test, or build check that would otherwise evaluate that defect.

## Acceptance Criteria

- `pnpm test` exits successfully after remediation.
- `pnpm exec tsc --noEmit` exits successfully with no TypeScript errors.
- `pnpm lint` exits successfully with no lint errors or warnings.
- `pnpm build` exits successfully, including its TypeScript validation stage.
- The pre-repair exploration test is documented and observed to fail against the unrepaired condition; the same validation criterion passes after remediation.
- Acceptance evidence records CLI results rather than relying solely on editor diagnostics.
