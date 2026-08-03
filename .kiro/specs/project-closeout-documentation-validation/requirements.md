# Requirements Document

## Introduction

This specification defines the project closeout documentation and verification evidence for the implemented operational web UI. It also records scope that is intentionally deferred and requires a separate decision and specification.

## Glossary

- **Documentation_Closeout**: The documentation process that updates `README.md` to describe the implemented operational web UI.
- **Operational_UI**: The implemented browser interface that consumes existing `/api/v1` endpoints for role-based administration, questionnaire operations, QR response flows, and reporting.
- **Closeout_Validation**: The process that records evidence from the existing automated verification commands.
- **Verification_Evidence**: A dated record containing a command, its exit status, a source revision identifier, and a concise result summary.
- **Deferred_Scope_Item**: A capability explicitly excluded from this closeout specification pending a separate product decision and specification.
- **Scope_Governance**: The record that maintains deferred scope and controls its admission to future work.

## Requirements

### Requirement 1: Synchronize operational UI documentation

**User Story:** As a project maintainer, I want the README to describe the implemented operational UI, so that local users and contributors have accurate usage guidance.

#### Acceptance Criteria

1. WHEN `README.md` is updated for closeout, THE Documentation_Closeout SHALL describe the Operational_UI as implemented and SHALL not describe it as unimplemented, a starter page, or REST-only.
2. WHEN `README.md` describes the Operational_UI, THE Documentation_Closeout SHALL identify role-based login, the mandatory password-change flow, user administration, branch administration, questionnaire management, QR management, employee QR response submission, and report access.
3. WHEN `README.md` describes Operational_UI boundaries, THE Documentation_Closeout SHALL state that the Operational_UI consumes the existing `/api/v1` API and that the closeout does not introduce a backend feature change.

### Requirement 2: Define final verification evidence

**User Story:** As a project maintainer, I want reproducible closeout evidence for the existing verification commands, so that the operational UI can be assessed from recorded results.

#### Acceptance Criteria

1. WHEN Closeout_Validation is performed, THE Closeout_Validation SHALL execute each of the following commands exactly once, without changing its arguments: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build`, including after any previously executed verification command returns a nonzero exit status.
2. WHEN a verification command completes, THE Closeout_Validation SHALL create exactly one Verification_Evidence record for that command containing the command as executed, the command completion date and time in ISO 8601 format with a UTC offset, the source revision identifier present when Closeout_Validation began, the command's exact exit status, and an output summary of no more than 2,000 characters.
3. IF any verification command returns a nonzero exit status, THEN THE Closeout_Validation SHALL retain that command's Verification_Evidence record, identify the command as failed in its output summary, and mark the closeout validation result as not passed.
4. WHEN all four verification commands return a zero exit status, THE Closeout_Validation SHALL mark the closeout validation result as passed and retain exactly four Verification_Evidence records, one for each verification command, with that result.

### Requirement 3: Record deferred future scope

**User Story:** As a project maintainer, I want future capability requests separated from closeout work, so that implementation scope remains controlled.

#### Acceptance Criteria

1. THE Scope_Governance SHALL record refresh authentication, persisted authentication state, cookies, BFF, logout, Server Actions, backend changes, and physical QR scanning as eight individually identifiable Deferred_Scope_Items.
2. IF a Deferred_Scope_Item is proposed for implementation, THEN THE Scope_Governance SHALL prevent design or implementation work for that item until a separate decision that identifies the item has approved its implementation and a separate Kiro specification that identifies the item has been created.
