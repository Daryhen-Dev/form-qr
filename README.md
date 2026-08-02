# form-qr

form-qr is an API-first questionnaire and QR response system for Ecuadorian branches. The backend is the product surface: administrators and secretaries manage branches, users, questionnaires, versions, assignments, and reports; employees scan assigned questionnaires and submit one daily response. The UI is intentionally not implemented yet (`app/page.tsx` is still the starter page).

## Architecture

The system follows `route handlers → services → repositories → Prisma/PostgreSQL`. Route handlers authenticate, validate, and map HTTP responses; services enforce authorization and business rules; repositories are the database boundary. QR scans resolve a published version for an employee's active branch. Business dates use `America/Guayaquil`.

## Roles

| Role | Capabilities |
| --- | --- |
| `Administrador` | Full user, branch, questionnaire, assignment, and report administration |
| `Secretario` | Manage employees, assign employees to branches, manage questionnaires, and read reports |
| `Empleado` | Scan assigned QR codes, upload response files/photos, and create daily responses |

## Stack and prerequisites

- Node.js 20+ and pnpm
- Docker Desktop with Docker Compose
- Next.js 16, React 19, TypeScript, Prisma 7, PostgreSQL 16, and MinIO

## Local setup (Windows PowerShell)

Run these commands in `C:\Proyects\form-qr`:

```powershell
pnpm install
Copy-Item .env.example .env
# Edit .env now: replace JWT_ACCESS_SECRET and JWT_REFRESH_SECRET with strong random secrets.
pnpm db:up
pnpm db:deploy
pnpm db:generate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000` only to see the starter page; use the REST API at `http://localhost:3000/api/v1`. The local database is PostgreSQL on port `5433`. MinIO runs at `http://localhost:9000`, with its console at `http://localhost:9001`.

## Environment variables

| Variable | Local value / purpose |
| --- | --- |
| `DATABASE_URL` | `postgresql://formqr:formqr@localhost:5433/form_qr` |
| `TEST_DATABASE_URL` | Dedicated integration-test database URL |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Required independent signing secrets; replace the examples outside local development |
| `ACCESS_TTL`, `REFRESH_TTL` | JWT lifetimes in seconds; defaults are `900` and `604800` |
| `SEED_ADMIN_CEDULA` | Optional admin bootstrap cedula; initial password is the cedula |
| `SEED_DEMO_USERS` | Demo seed opt-in only when exactly `true` (any case) or `1`; default `false` |
| `SEED_SECRETARY_CEDULA`, `SEED_EMPLOYEE_CEDULA` | Required numeric 6–15 digit cedulas when demos are enabled |
| `APP_URL` | Base URL used in QR scan links, normally `http://localhost:3000` |
| `STORAGE_PROVIDER` | `minio` locally |
| `STORAGE_ENDPOINT`, `STORAGE_REGION` | `http://localhost:9000`, `us-east-1` |
| `STORAGE_BUCKET` | `form-qr` |
| `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | Local MinIO `minioadmin` / `minioadmin`; development-only values |

The seed is idempotent: it upserts by cedula and uses `update: {}`. It never resets an existing password. Demo users are opt-in and must not be used as production credentials. Every newly seeded user starts with password equal to their cedula and `passwordChangeRequired=true`, so change it immediately. For uploads, create the `form-qr` bucket manually in the MinIO console before using presigned uploads.

With the example values, local credentials are:

| User | Cedula | Initial password |
| --- | --- | --- |
| Admin | `12345678` | `12345678` |
| Secretario Demo | `12345679` | `12345679` |
| Empleado Demo | `12345670` | `12345670` |

The demo rows exist only after setting `SEED_DEMO_USERS=true` in `.env` and running `pnpm db:seed`. These credentials are for local development only.

## Authentication with `curl.exe`

Login is public. Replace placeholders with values from each JSON response:

```powershell
# 1. Login with the seeded admin password.
curl.exe -s -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"cedula":"12345678","password":"12345678"}'

# 2. Change the initial password using the returned access token.
curl.exe -s -X POST http://localhost:3000/api/v1/auth/change-password -H "Authorization: Bearer <INITIAL_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"newPassword":"<NEW_PASSWORD_8_OR_MORE_CHARS>"}'

# 3. Login again with the new password; save the new access token.
curl.exe -s -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"cedula":"12345678","password":"<NEW_PASSWORD_8_OR_MORE_CHARS>"}'

# 4. Create an employee (Administrador can create any role).
curl.exe -s -X POST http://localhost:3000/api/v1/users -H "Authorization: Bearer <NEW_ADMIN_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"nombres":"Local","apellidos":"Employee","cedula":"12345671","role":"Empleado"}'

# 5. List active users.
curl.exe -s http://localhost:3000/api/v1/users -H "Authorization: Bearer <NEW_ADMIN_ACCESS_TOKEN>"
```

The initial access token keeps the `pcr=true` claim even after changing the password. It cannot access gated routes; log in again and use the new token. Repeat the same change-password flow for any newly created or demo user.

## Chainable API smoke test

The following is a minimal REST flow. Capture IDs from each response and substitute them into later commands. Use the new admin token after the password change. Use the employee token for scan and response calls. PowerShell's `curl.exe` uses the same JSON bodies shown below.

```powershell
# A. Create a branch; save branch.id as BRANCH_ID.
curl.exe -s -X POST http://localhost:3000/api/v1/branches -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"name":"Smoke Branch","code":"SMOKE","address":"Local address"}'

# B. Assign an Empleado user; substitute BRANCH_ID and EMPLOYEE_ID.
curl.exe -s -X POST http://localhost:3000/api/v1/branches/<BRANCH_ID>/employees -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"userId":"<EMPLOYEE_ID>"}'

# C. Create a questionnaire; save questionnaire.id as QUESTIONNAIRE_ID.
curl.exe -s -X POST http://localhost:3000/api/v1/questionnaires -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"title":"Daily cleanliness","description":"Minimal smoke test"}'

# D. Create a draft version; save version.id as VERSION_ID. The body must be {}.
curl.exe -s -X POST http://localhost:3000/api/v1/questionnaires/<QUESTIONNAIRE_ID>/versions -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{}'

# E. Replace its questions with one boolean; save version.questions[0].id as QUESTION_ID.
curl.exe -s -X PATCH http://localhost:3000/api/v1/questionnaires/<QUESTIONNAIRE_ID>/versions/<VERSION_ID> -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"questions":[{"order":1,"prompt":"Was the area clean?","required":true,"type":"boolean","config":{}}]}'

# F. Publish the version.
curl.exe -s -X POST http://localhost:3000/api/v1/questionnaires/<QUESTIONNAIRE_ID>/versions/<VERSION_ID>/publish -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"

# G. Assign the questionnaire to the branch.
curl.exe -s -X POST http://localhost:3000/api/v1/questionnaires/<QUESTIONNAIRE_ID>/branches -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"branchId":"<BRANCH_ID>"}'

# H. Get the permanent QR; save qr.qrToken as QR_TOKEN.
curl.exe -s http://localhost:3000/api/v1/questionnaires/<QUESTIONNAIRE_ID>/qr -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"

# I. Scan as the employee; use the question id returned by scan.questions[0].id.
curl.exe -s http://localhost:3000/api/v1/scan/<QR_TOKEN> -H "Authorization: Bearer <EMPLOYEE_ACCESS_TOKEN>"

# J. Create today's response. Use QUESTION_ID from scan and the questionnaire ID.
curl.exe -s -X POST http://localhost:3000/api/v1/responses -H "Authorization: Bearer <EMPLOYEE_ACCESS_TOKEN>" -H "Content-Type: application/json" -d '{"questionnaireId":"<QUESTIONNAIRE_ID>","answers":[{"questionId":"<QUESTION_ID>","type":"boolean","value":true}]}'

# K. Reports as admin/secretary. Set BUSINESS_DAY to scan.response.businessDay when present;
#    if scan.status is absent, use the local Ecuador date in America/Guayaquil (YYYY-MM-DD).
curl.exe -s "http://localhost:3000/api/v1/reports/pending?businessDay=<BUSINESS_DAY>" -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
curl.exe -s "http://localhost:3000/api/v1/reports/compliance?from=<BUSINESS_DAY>&to=<BUSINESS_DAY>" -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
curl.exe -s "http://localhost:3000/api/v1/reports/history?from=<BUSINESS_DAY>&to=<BUSINESS_DAY>" -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

`POST /responses` returns the created `response` and enforces one response per employee, questionnaire, and business day. The three report endpoints return `pending`, compliance `summary/details`, and paginated response `results` respectively. Date query values are `YYYY-MM-DD` in `America/Guayaquil`; the server stores timestamps in UTC.

## Endpoint map

| Endpoint | Methods | Roles |
| --- | --- | --- |
| `/api/v1/auth/login` | POST | Public |
| `/api/v1/auth/change-password`, `/refresh`, `/logout` | POST | Authenticated |
| `/api/v1/users` | GET/POST | Admin/Secretario, with service-level limits |
| `/api/v1/users/:id` | GET/PATCH/DELETE | Admin/Secretario, with service-level limits |
| `/api/v1/users/:id/branch` | GET | Admin/Secretario |
| `/api/v1/branches`, `/api/v1/branches/:id` | GET/POST/PATCH/DELETE | Admin/Secretario reads; Admin mutations |
| `/api/v1/branches/:id/employees` | GET/POST | Admin/Secretario |
| `/api/v1/questionnaires`, `/api/v1/questionnaires/:id` | GET/POST/PATCH/DELETE | Admin/Secretario |
| `/api/v1/questionnaires/:id/versions` and `/:versionId` | GET/POST/PATCH | Admin/Secretario |
| `/api/v1/questionnaires/:id/versions/:versionId/publish` | POST | Admin/Secretario |
| `/api/v1/questionnaires/:id/branches` | GET/POST | Admin/Secretario |
| `/api/v1/questionnaires/:id/qr` | GET | Admin/Secretario |
| `/api/v1/scan/:qrToken` | GET | Empleado |
| `/api/v1/responses` and `/api/v1/responses/:id` | POST/PATCH/GET | Empleado flow |
| `/api/v1/uploads/presign` | POST | Authenticated response flow |
| `/api/v1/reports/pending`, `/compliance`, `/history` | GET | Admin/Secretario |
| `/api/v1/health` | GET | Authenticated health check (the current proxy protects `/api/*` except login and refresh) |

## Testing and limitations

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

There is no visual login or dashboard yet; `app/page.tsx` is a starter page. The supported workflow is REST-first. Upload questions require a reachable S3-compatible storage service and the `form-qr` MinIO bucket created in the console. Never expose demo credentials outside local development, and replace JWT and storage secrets before deploying.
