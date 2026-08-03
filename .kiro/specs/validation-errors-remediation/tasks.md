# Implementation Plan: Validation Errors Remediation

## Overview
Remediate recorded command-line type, lint, and build failures while preserving existing product behavior and validation coverage.

## Scope Guard
- Modify only the source and test files named below to correct reported validation defects.
- Do not modify `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `next.config.ts`, package scripts, ignore lists, command arguments, or product behavior. Do not add suppressions such as `eslint-disable`, `@ts-ignore`, or `@ts-expect-error`.

## Task Dependency Graph
```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"], "dependsOn": [] },
    { "wave": 2, "tasks": ["3", "4", "5.1", "5.2"], "dependsOn": ["1", "2"] },
    { "wave": 3, "tasks": ["5.3", "5.4", "5.5", "5.6", "5.7.1", "5.7.2", "5.7.3", "5.7.4", "5.8", "5.9"], "dependsOn": ["3", "4", "5.1", "5.2"] },
    { "wave": 4, "tasks": ["6.1"], "dependsOn": ["3", "4", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7.1", "5.7.2", "5.7.3", "5.7.4", "5.8", "5.9"] },
    { "wave": 5, "tasks": ["6.2"], "dependsOn": ["6.1"] },
    { "wave": 6, "tasks": ["6.3"], "dependsOn": ["6.2"] },
    { "wave": 7, "tasks": ["6.4"], "dependsOn": ["6.3"] }
  ]
}
```

## Tasks
- [x] 1. Write and run the baseline bug-condition exploration test (RED)
  - **Property 1: Bug Condition** - Validation commands succeed after remediation.
  - Create `tests/validation-errors-remediation.exploration.unit.test.ts` to run `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` sequentially with their normal arguments; record each command, exit status, and complete non-zero output.
  - On the unrepaired baseline, assert exit status `0` for each command and document the expected RED counterexamples: the password-change `RequestInit` error at `components/auth/password-change-form.tsx:174`, the ten-file TypeScript inventory, lint errors/warnings, and build type-check failure. Do not repair the test or source when it fails.
  - _Requirements: 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.3_

- [x] 2. Capture preservation behavior before source repairs
  - **Property 2: Preservation** - Existing authentication, route, API, upload, report, and UI assertions remain stable for inputs where `isBugCondition` is false.
  - Files: `lib/auth/login-ui.unit.test.ts`, `lib/operational-api/client.pbt.test.ts`, `lib/operational-api/uploads.unit.test.ts`, `lib/operational-ui/routes.pbt.test.ts`, `components/auth/password-change-form.ui.test.tsx`, and `components/operational/reports/reports.ui.test.tsx`.
  - Observe and record the unfixed baseline’s passing behavioral assertions, including the recorded 59 test files and 742 tests; retain API payload, authentication, route-surface, upload, and report assertions without changing product semantics.
  - _Requirements: 3.1, 3.2, 3.3, 4.2, 4.3_

- [x] 3. Repair static contracts and test tuples
  - [x] 3.1 Make `ChangePasswordRequest` compatible with `RequestInit` in `components/auth/password-change-form.tsx`; retain the existing `POST` method, JSON `newPassword` body, and Bearer header. Update only the response fixture typing in `components/auth/password-change-form.ui.test.tsx` using a complete response factory or deliberate `unknown` bridge.
    - _Requirements: 2.1, 2.5, 3.2, 3.3, 4.2, 4.3_
  - [x] 3.2 Align the login-field literal/type boundary in `lib/auth/login-ui.unit.test.ts` and replace empty marker extension interfaces with equivalent aliases in `lib/operational-api/contracts.ts`.
    - _Requirements: 2.2, 2.4, 3.2, 3.3, 4.2, 4.3_
  - [x] 3.3 Type the fetch-call fixture as a tuple with an optional init member before inspecting headers in `lib/operational-api/client.pbt.test.ts`.
    - _Requirements: 2.2, 3.3, 4.2, 4.3_
  - [x] 3.4 Use the actual Vitest call-tuple shape in `lib/operational-api/domain-clients.unit.test.ts` without changing request assertions.
    - _Requirements: 2.2, 3.3, 4.2, 4.3_
  - [x] 3.5 Narrow or guard recorded calls before reading optional request members in `lib/operational-api/scan-responses.unit.test.ts`.
    - _Requirements: 2.2, 3.3, 4.2, 4.3_
  - [x] 3.6 Narrow or guard optional upload call init values in `lib/operational-api/uploads.unit.test.ts`; preserve upload URLs and authorization headers.
    - _Requirements: 2.2, 3.2, 3.3, 4.2, 4.3_
  - [x] 3.7 Model the second fetch-call tuple member as optional in `components/operational/reports/reports.ui.test.tsx` while preserving report rendering assertions.
    - _Requirements: 2.2, 3.2, 3.3, 4.2, 4.3_

- [x] 4. Repair operational-route type safety
  - [x] 4.1 Carry the validated `access` value into a non-optional local before reading availability in `lib/operational-ui/routes.ts`, and narrow the generated access fixture equivalently in `lib/operational-ui/routes.pbt.test.ts`.
    - Preserve login, password-change, operational, and denied-fallback surfaces and the safe fallback message.
    - _Requirements: 2.3, 3.2, 3.3, 4.2, 4.3_

- [x] 5. Restructure Hooks lint violations without behavioral changes
  - [x] 5.1 Replace the synchronous mount-effect state update in `components/auth/login-form.tsx` with the smallest rule-compliant initialization or event structure; preserve login validation, session availability, mandatory password-change handling, and secret clearing.
    - _Requirements: 2.4, 3.2, 4.2, 4.3_
  - [x] 5.2 Use the complete lint transcript recorded by `tests/validation-errors-remediation.exploration.unit.test.ts` to identify each reported `components/operational/**` loading/effect component, then restructure only those recorded components to satisfy `react-hooks/set-state-in-effect` while preserving request count, loading/error rendering, cleanup, and existing interaction assertions.
    - _Requirements: 2.4, 3.2, 3.3, 4.2, 4.3_
  - [x] 5.3 Correct the `TS2322` fetch-call fixture at `components/operational/questionnaires/questionnaires.ui.test.tsx:180` by representing its second tuple member as optional; preserve questionnaire request matching and rendering assertions, then run `pnpm vitest run --project ui components/operational/questionnaires/questionnaires.ui.test.tsx`.
    - _Requirements: 2.2, 3.2, 3.3, 4.2, 4.3_
  - [x] 5.4 Remove or use only the unused `makeQuestionnaire` helper reported at `components/operational/questionnaires/questionnaires.ui.test.tsx:71:10`; retain fixture behavior and run its focused UI suite.
    - _Requirements: 2.4, 3.1, 3.3, 4.2, 4.3_
  - [x] 5.5 Remove or use only the unused `makeHistoryReport` helper reported at `components/operational/reports/reports.ui.test.tsx:155:10`; retain report rendering assertions and run `pnpm vitest run --project ui components/operational/reports/reports.ui.test.tsx`.
    - _Requirements: 2.4, 3.1, 3.3, 4.2, 4.3_
  - [x] 5.6 Replace the invalid `aria-required` use on the implicit radio at `components/operational/scan/question-control.tsx:192:19` with supported required-state semantics only; retain radio validation/accessibility behavior and run `pnpm vitest run --project ui components/operational/scan/scan.ui.test.tsx`.
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 4.2, 4.3_
  - [x] 5.7.1 Correct the unused `_accessToken` parameter reported at `lib/auth/login-ui.unit.test.ts:44:45` without changing the login mock contract; run `pnpm vitest run --project unit lib/auth/login-ui.unit.test.ts`.
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 4.2, 4.3_
  - [x] 5.7.2 Correct the unused `_refreshToken` parameter reported at `lib/auth/login-ui.unit.test.ts:45:46` without changing the login mock contract; run the focused login unit suite.
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 4.2, 4.3_
  - [x] 5.7.3 Correct the unused `_user` parameter reported at `lib/auth/login-ui.unit.test.ts:46:38` without changing the login mock contract; run the focused login unit suite.
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 4.2, 4.3_
  - [x] 5.7.4 Correct the unused `_passwordChangeRequired` parameter reported at `lib/auth/login-ui.unit.test.ts:47:56` without changing the login mock contract; run the focused login unit suite.
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 4.2, 4.3_
  - [x] 5.8 Remove or use only the unused `AssignmentConflictError` import reported at `lib/repositories/branch-assignment.repository.integration.test.ts:17:3`; retain integration assertions and run `pnpm vitest run --project integration lib/repositories/branch-assignment.repository.integration.test.ts`.
    - _Requirements: 2.4, 3.1, 3.3, 4.2, 4.3_
  - [x] 5.9 Remove or use only the unused `authRefresh` value reported at `lib/services/auth.service.unit.test.ts:49:28`; retain refresh-flow assertions and run `pnpm vitest run --project unit lib/services/auth.service.unit.test.ts`.
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 4.2, 4.3_

- [x] 6. Validate the completed remediation
  - [x] 6.1 After tasks 5.3–5.9 are complete, run the focused unit suites listed in the design for `lib/auth/login-ui.unit.test.ts`, operational API tuple suites, `lib/operational-ui/routes.pbt.test.ts`, `lib/repositories/branch-assignment.repository.integration.test.ts`, and `lib/services/auth.service.unit.test.ts`; then run the focused UI suites for password change, reports, questionnaires, and scan controls.
    - _Requirements: 3.1, 3.2, 3.3_
  - [x] 6.2 Re-run the same exploration test from task 1.
    - **Property 1: Expected Behavior** - Each recorded TypeScript, lint, and build validator exits `0`, with zero TypeScript errors, lint errors, and lint warnings.
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 2.4, 2.5, 4.1_
  - [x] 6.3 Re-run the preservation suites from task 2.
    - **Property 2: Preservation** - Existing passing input behavior and assertions remain unchanged.
    - _Requirements: 3.1, 3.2, 3.3, 4.2, 4.3_
  - [x] 6.4 Run `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` exactly once each, in that order; record all statuses and every non-zero transcript. Pass only if all exit `0`, tests report at least 59 files and 742 tests, and lint reports zero errors and warnings.
    - Confirm the remediation diff contains no configuration edits, ignored/excluded checks, changed command arguments, or source suppression directives such as `eslint-disable`, `@ts-ignore`, or `@ts-expect-error`.
    - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 4.1, 4.2, 4.3_

## Notes
- Task 5.2 intentionally derives operational component paths only from the baseline lint transcript because the design does not name those files; this prevents unsupported scope expansion.
- This planning update ran exactly one read-only CLI inspection: `pnpm lint` with its normal arguments, which exited `0` with 0 errors and 9 warnings. No correction code, product tests, configuration, scripts, README, or validation task 6.1–6.4 was run or modified.
- Tasks 5.3–5.9 and 6.1–6.4 were executed and their checkboxes reconciled manually because the task-tool DAG rejected `in_progress` transitions for tasks added by direct edits (tracked upstream as Gentleman-Programming/gentle-ai#2362). Final CLI validation, run once each in order, all exited `0`: `pnpm test` (60 files / 743 tests), `pnpm exec tsc --noEmit` (0 errors), `pnpm lint` (0 errors / 0 warnings), `pnpm build` (type-check + route generation succeeded). No configuration, ignore, command-argument, or suppression change was made.
