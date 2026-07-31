# lib — Layer Architecture

## Layer Diagram

```
app/api/v1/**     (Route Handlers)
      │
      ▼
lib/services/     (Business logic)
      │
      ▼
lib/repositories/ (Prisma queries — only place @prisma/client is used)
      │
      ▼
lib/db/           (PrismaClient singleton)

lib/validations/  ─── cross-cutting (used at handler boundary)
lib/types/        ─── cross-cutting (plain TS interfaces, no Prisma)
```

## Call Direction Rules

- Route handlers call **services only** — never repositories or `lib/db` directly.
- Services call **repositories only** — never `lib/db` directly.
- Repositories call **`lib/db`** — the only layer that imports `@prisma/client`.
- `lib/validations/` and `lib/types/` are cross-cutting: usable by handlers, services, and repositories.

**Violation example**: a route handler importing from `lib/repositories/` is a hard convention violation.

## Soft-Delete Convention

Soft-deletable models include a `deletedAt DateTime?` field. Repositories:
- Filter `where: { deletedAt: null }` by default in all list/find helpers.
- Do **not** export a hard-delete function — deletion means setting `deletedAt`.

## AuditLog Write Path

After any state-mutating service operation, call `auditRepository.record(action, entityType, entityId)`. This path is established in Slice 1 schema; callers are added per slice.

## UTC Rule

All `DateTime` fields use `@default(now())` or `new Date()` — both produce UTC epoch values. Never store local-timezone-offset datetimes. Reads serialize to ISO-8601 strings ending in `Z`.

## Zod-on-Handler Validation + 422 Contract

```ts
const result = schema.safeParse(await request.json())
if (!result.success) {
  return Response.json(
    { error: 'validation_failed', issues: result.error.issues },
    { status: 422 }
  )
}
// result.data is typed — pass to service
```

## server-only Boundary

Every module in `lib/db/` and `lib/repositories/` begins with `import 'server-only'`. This causes a build-time error if any of these modules are imported from a client component or client bundle.
