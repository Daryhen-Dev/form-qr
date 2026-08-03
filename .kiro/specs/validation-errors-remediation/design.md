# Validation Errors Remediation Bugfix Design

## Overview

This bugfix removes reproducible command-line validation failures from the checked-out baseline `9cf296d126d456a5c4527fbbe0e79bfa81ce3215`. The repair is type- and lint-local: correct static contracts, mocks, tuples, and effect structure while retaining the established API payloads, authentication flow, route authorization, and operational UI behavior. CLI output is authoritative; workspace diagnostics are currently clean and are recorded only as supplementary evidence.

## Glossary

- **Bug_Condition (C)**: A required validation command exits non-zero for the unchanged project input.
- **Property (P)**: The repaired project exits successfully with zero TypeScript errors, lint errors, and lint warnings while its existing tests and behavior remain intact.
- **Preservation**: Inputs and observable results outside the validation defects remain unchanged.
- **F**: The baseline source and test suite at the recorded revision.
- **F'**: The minimally corrected source and test suite.
- **CLI validation**: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`.
- **RequestInit**: The browser fetch-options contract consumed by the password-change request.

## Bug Details

### Bug Condition

The baseline has reproducible type-check, lint, and build failures although `pnpm test` passed 59 files and 742 tests. TypeScript's incremental metadata identifies 33 errors in exactly 10 files; the build stops at the type-check stage. Lint records 12 errors and 9 warnings.

**Formal specification:**
```
C(X) = validator(X) ∈ {tsc, lint, build} ∧ exitCode(validator(X)) ≠ 0

FUNCTION isBugCondition(input)
  INPUT: input of type ValidationRun
  OUTPUT: boolean

  RETURN input.command IN ["pnpm exec tsc --noEmit", "pnpm lint", "pnpm build"]
         AND input.exitCode != 0
         AND input.revision = "9cf296d126d456a5c4527fbbe0e79bfa81ce3215"
END FUNCTION
```

### Baseline TypeScript Inventory

| File | Exact category | Minimal repair direction |
|---|---|---|
| `lib/auth/login-ui.unit.test.ts` | TS2367 ×3 and TS2345 ×3: uppercase `LOGIN_FIELD` literals conflict with lower-case `LoginField` values | Align the field constant/type boundary; preserve validation and request-field values. |
| `lib/operational-api/client.pbt.test.ts` | TS2493 ×2 and TS2339: empty mock-call tuple indexed, producing `never.headers` | Type the fetch-call fixture as an optional-init tuple before reading it. |
| `lib/operational-api/domain-clients.unit.test.ts` | TS2493 ×2: empty mock-call tuple indexed | Use the actual Vitest call tuple shape. |
| `lib/operational-api/scan-responses.unit.test.ts` | TS2493 ×6 and TS2339 ×3: empty tuple indexing and `never` request members | Narrow/guard recorded calls before inspecting request options. |
| `lib/operational-api/uploads.unit.test.ts` | TS2493 ×4 and TS2339 ×3: empty tuple indexing and `never` request members | Narrow/guard recorded upload calls without changing upload headers or URLs. |
| `lib/operational-ui/routes.ts` | TS18048: `access` possibly undefined after role validation | Retain the guard but establish the non-optional access value before reading availability. |
| `lib/operational-ui/routes.pbt.test.ts` | TS18048: generated `access` possibly undefined after role validation | Narrow the fixture consistently before availability access. |
| `components/auth/password-change-form.tsx` | TS2769/TS2345 chain: `ChangePasswordRequest.headers` lacks the `HeadersInit` record index signature | Declare the request as a compatible `RequestInit`-shaped contract without changing headers, method, or body. |
| `components/auth/password-change-form.ui.test.tsx` | TS2352: incomplete response stub cast directly to `Response` | Use a complete response factory or intentionally bridge through `unknown`; preserve response branches. |
| `components/operational/reports/reports.ui.test.tsx` | TS2322: optional fetch init tuple assigned where init is required | Model the second tuple member as optional. |

### Post-Repair Validation Inventory

A single post-repair read-only run of `pnpm lint` exited `0` with `0` errors and the nine warnings transcribed below. This transcript is the scope authority for the remaining lint work; no configuration, ignore, command-argument, or suppression change is permitted.

One TypeScript error also remains from the completed repairs: `TS2322` at `components/operational/questionnaires/questionnaires.ui.test.tsx:180`. The fixture returns a fetch call tuple whose `RequestInit` member is optional but is currently typed as required. The repair must express the optional tuple member without changing questionnaire behavior or request assertions.

### Lint Warning Transcript

| File | Line:column | Warning message | Rule |
|---|---:|---|---|
| `components/operational/questionnaires/questionnaires.ui.test.tsx` | 71:10 | `'makeQuestionnaire' is defined but never used` | `@typescript-eslint/no-unused-vars` |
| `components/operational/reports/reports.ui.test.tsx` | 155:10 | `'makeHistoryReport' is defined but never used` | `@typescript-eslint/no-unused-vars` |
| `components/operational/scan/question-control.tsx` | 192:19 | `The attribute aria-required is not supported by the role radio. This role is implicit on the element input` | `jsx-a11y/role-supports-aria-props` |
| `lib/auth/login-ui.unit.test.ts` | 44:45 | `'_accessToken' is defined but never used` | `@typescript-eslint/no-unused-vars` |
| `lib/auth/login-ui.unit.test.ts` | 45:46 | `'_refreshToken' is defined but never used` | `@typescript-eslint/no-unused-vars` |
| `lib/auth/login-ui.unit.test.ts` | 46:38 | `'_user' is defined but never used` | `@typescript-eslint/no-unused-vars` |
| `lib/auth/login-ui.unit.test.ts` | 47:56 | `'_passwordChangeRequired' is defined but never used` | `@typescript-eslint/no-unused-vars` |
| `lib/repositories/branch-assignment.repository.integration.test.ts` | 17:3 | `'AssignmentConflictError' is defined but never used` | `@typescript-eslint/no-unused-vars` |
| `lib/services/auth.service.unit.test.ts` | 49:28 | `'authRefresh' is defined but never used` | `@typescript-eslint/no-unused-vars` |

The completed lint repairs for Hooks effects and empty object types remain intact. The remaining planned changes are test-fixture/local-markup cleanup only, with focused preservation coverage before full CLI validation.

### Examples

- Submitting a password change constructs the correct POST payload, but TypeScript rejects its narrow header interface as `RequestInit`.
- A valid route fixture reaches `access.availability`, but TypeScript cannot prove that the optional fixture is present.
- A mocked fetch call is valid at runtime, but a test indexes an inferred empty tuple and reaches `never`.
- Login hydration sets state after mount, but the Hooks lint rule rejects synchronous state-setting from the effect.

## Expected Behavior

### Preservation Requirements

**Unchanged behaviors:**
- Password change remains `POST /api/v1/auth/change-password` with JSON `newPassword` and the existing Bearer authorization header.
- Login validation, session availability, mandatory password-change handling, and secret-clearing behavior remain unchanged.
- Role-scoped operational routes keep their current allowed surfaces and safe fallback message.
- Operational API client requests, upload authorization rules, report rendering, and existing test assertions retain their behavior.

**Scope:** All non-defect inputs remain unaffected, including mouse/keyboard UI actions, API payload shape, authentication status transitions, role authorization, and valid test fixtures. No check may be disabled, suppressed, ignored, or excluded.

## Hypothesized Root Cause

1. **Contract drift**: locally narrow interfaces and literal unions no longer satisfy platform contracts (`RequestInit`, `LoginField`).
2. **Mock inference drift**: newer Vitest tuple inference correctly exposes unguarded optional call arguments.
3. **Optional-flow proof gap**: runtime guards exist, but TypeScript cannot preserve the corresponding non-null fact across later access.
4. **Framework lint evolution**: the current Next/React lint rules reject synchronous effect state changes and empty marker interfaces that earlier code allowed.

## Correctness Properties

Property 1: Bug Condition - Validation Commands Succeed

_For any_ baseline-representative source and test input where `isBugCondition` returns true, F' SHALL complete the relevant validator with exit code 0 and the expected type/lint result.

**Validates: Requirements 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1**

Property 2: Preservation - Existing Product Contracts Remain Stable

_For any_ input where `isBugCondition` returns false, F' SHALL produce the same observable API, authentication, route, upload, and UI result as F, preserving existing automated assertions.

**Validates: Requirements 3.1, 3.2, 3.3, 4.2, 4.3**


## Fix Implementation

### Changes Required

1. **Repair static contracts only.** Make `ChangePasswordRequest` assignable to `RequestInit`; correct the login field literal/type relationship; replace empty extension interfaces with type aliases where they add no members.
2. **Make test observations honest.** Type mock-call tuples with an optional second member and guard absent calls before property access. Complete fake `Response` construction through the existing test helper pattern.
3. **Carry proven optional values.** Assign validated `access` candidates to non-optional locals before reading their fields in production and property tests.
4. **Restructure linted effects, not behavior.** Replace direct mount-time state initialization and effect-driven loading patterns with the smallest rule-compliant initialization/event structure that preserves request count, loading/error rendering, and cleanup behavior.
5. **Do not alter configuration.** `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `next.config.ts`, package scripts, command arguments, ignore lists, and source suppression directives are out of scope. Do not add `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `--quiet`, `--ignore-pattern`, or TypeScript exclusions.

## Testing Strategy

### Validation Approach

First run the exploration on unrepaired code to surface the stored counterexamples; then apply the local fixes, run focused tests, and finally run all four acceptance commands once each. Record exit status and complete non-zero output; do not treat clean editor diagnostics as command-line success.

### Exploratory Bug Condition Checking

Create `tests/validation-errors-remediation.exploration.unit.test.ts` before repair. It runs `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` sequentially, records every command/status/output, and asserts all must exit 0. It MUST fail on the baseline (observed `1`, `1`, `1`) and becomes the regression check after repair. It must not rewrite source, configuration, caches, or command options.

**Expected counterexamples:** the `RequestInit` mismatch at `password-change-form.tsx:174`; the ten-file TypeScript inventory; lint errors/warnings, including Hooks effects and empty object types; and build failure at type-checking.

### Fix Checking

```
FUNCTION expectedBehavior(result)
  RETURN result.exitCode = 0
         AND result.typeScriptErrors = 0
         AND result.lintErrors = 0
         AND result.lintWarnings = 0
END FUNCTION

FOR ALL input WHERE isBugCondition(input) DO
  result := runValidatorOnFixedSource(input.command)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT F(input) = F'(input)
END FOR
```

Preservation specifically compares existing password-change, login, route-surface, protected-client, upload, and report tests before/after the static repair.

### Unit Tests

- Extend login, password-change, route, client, scan-response, and upload tests only to express corrected static fixtures; retain their current behavioral assertions.
- Add an example that the password-change request remains method/body/header identical after its type changes.
- Verify route guards still return login, password-change, operational, and denied-fallback surfaces.

### Property-Based Tests

- Preserve the existing route-surface property over valid, restricted, invalid, and absent access candidates.
- Preserve client/upload request properties across generated request data and optional mock init values.
- Use the exploration test as the intentionally failing pre-repair property-level command check; it must be observed RED before source repair.

### Integration Tests

- Run the existing login/password-change and operational API integration coverage without changing product flows.
- Run operational UI suites that cover loader state, reports, and user interactions after effect restructuring.

### Targeted Commands

Run after the RED exploration has been captured:

```text
pnpm vitest run --project unit lib/auth/login-ui.unit.test.ts lib/operational-api/client.pbt.test.ts lib/operational-api/domain-clients.unit.test.ts lib/operational-api/scan-responses.unit.test.ts lib/operational-api/uploads.unit.test.ts lib/operational-ui/routes.pbt.test.ts
pnpm vitest run --project ui components/auth/password-change-form.ui.test.tsx components/operational/reports/reports.ui.test.tsx
```

### Full CLI Validation

Run exactly once each, in this order, after targeted checks pass:

```text
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

The remediation passes only if every command exits 0. No migration, rollout, feature flag, API version, or configuration change is required.
