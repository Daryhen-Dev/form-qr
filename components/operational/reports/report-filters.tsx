"use client"

import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import { fieldIssueMessage } from "@/components/operational/admin/operation-feedback"
import { Alert } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ProtectedResult } from "@/lib/operational-api/contracts"
import {
  isRealCalendarDate,
  isWithinAllowedRange,
  MAX_RANGE_DAYS,
} from "@/lib/operational-api/report-query"

/**
 * Report filter form for the pending, compliance and history reports.
 *
 * Renders ONLY the filters each report type accepts (Requirements 6.3-6.5) and
 * validates real calendar dates and the inclusive 31-day range cap before a
 * query is issued (Requirements 6.2, 6.4, 6.5), reusing the pure predicates in
 * `report-query.ts` as the single source of truth. When client validation
 * fails the parent is never asked to send a request; when the Existing API
 * Contract answers HTTP 422 the parent keeps every entered value and passes the
 * validation result back here so each issue associates with its control via
 * `aria-invalid` / `aria-describedby` (Requirement 6.7). Anything left
 * unassociated is announced once through `StatusRegion` (Requirement 7.8).
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.7, 9.1, 9.2, 9.3, 9.4
 */

export const REPORT_TYPE = {
  PENDING: "pending",
  COMPLIANCE: "compliance",
  HISTORY: "history",
} as const

export type ReportType = (typeof REPORT_TYPE)[keyof typeof REPORT_TYPE]

/** Every filter value the three report forms may hold, as raw strings. */
export interface ReportFilterValues {
  readonly businessDay: string
  readonly from: string
  readonly to: string
  readonly branchId: string
  readonly questionnaireId: string
  readonly employeeId: string
}

export const EMPTY_REPORT_FILTERS: ReportFilterValues = {
  businessDay: "",
  from: "",
  to: "",
  branchId: "",
  questionnaireId: "",
  employeeId: "",
}

type FilterField = keyof ReportFilterValues

interface FilterFieldDef {
  readonly field: FilterField
  readonly label: string
  readonly kind: "date" | "text"
  readonly required: boolean
}

/**
 * Declarative field layout per report type, in visual reading order. This is
 * the single place the allowed filters are declared, mirroring the query
 * builders so the form never offers a parameter the endpoint rejects.
 */
const FILTER_FIELDS: Record<ReportType, readonly FilterFieldDef[]> = {
  [REPORT_TYPE.PENDING]: [
    { field: "businessDay", label: "Día de negocio", kind: "date", required: true },
    { field: "branchId", label: "Sucursal (ID)", kind: "text", required: false },
    {
      field: "questionnaireId",
      label: "Cuestionario (ID)",
      kind: "text",
      required: false,
    },
  ],
  [REPORT_TYPE.COMPLIANCE]: [
    { field: "from", label: "Desde", kind: "date", required: true },
    { field: "to", label: "Hasta", kind: "date", required: false },
    { field: "branchId", label: "Sucursal (ID)", kind: "text", required: false },
    {
      field: "questionnaireId",
      label: "Cuestionario (ID)",
      kind: "text",
      required: false,
    },
  ],
  [REPORT_TYPE.HISTORY]: [
    { field: "from", label: "Desde", kind: "date", required: true },
    { field: "to", label: "Hasta", kind: "date", required: true },
    { field: "employeeId", label: "Empleado (ID)", kind: "text", required: false },
    { field: "branchId", label: "Sucursal (ID)", kind: "text", required: false },
    {
      field: "questionnaireId",
      label: "Cuestionario (ID)",
      kind: "text",
      required: false,
    },
  ],
}

/** Safe field-level message shown when a date fails client validation. */
const INVALID_DATE_MESSAGE = "Ingresá una fecha válida (día calendario real)."

/** Safe field-level message shown when the inclusive range exceeds the cap. */
const INVALID_RANGE_MESSAGE = `El rango no puede superar ${MAX_RANGE_DAYS} días.`

/**
 * Compute client-side field issues for the required dates and the inclusive
 * range cap, reusing the pure report-query predicates. An empty object means
 * the values are safe to send.
 */
export function clientFilterIssues(
  reportType: ReportType,
  values: ReportFilterValues
): Partial<Record<FilterField, string>> {
  const issues: Partial<Record<FilterField, string>> = {}

  if (reportType === REPORT_TYPE.PENDING) {
    if (!isRealCalendarDate(values.businessDay)) {
      issues.businessDay = INVALID_DATE_MESSAGE
    }
    return issues
  }

  // compliance + history both require a real `from`.
  if (!isRealCalendarDate(values.from)) {
    issues.from = INVALID_DATE_MESSAGE
  }

  const toRequired = reportType === REPORT_TYPE.HISTORY
  const hasTo = values.to.length > 0

  if (toRequired && !hasTo) {
    issues.to = INVALID_DATE_MESSAGE
  } else if (hasTo && !isRealCalendarDate(values.to)) {
    issues.to = INVALID_DATE_MESSAGE
  } else if (
    hasTo &&
    isRealCalendarDate(values.from) &&
    !isWithinAllowedRange(values.from, values.to)
  ) {
    issues.to = INVALID_RANGE_MESSAGE
  }

  return issues
}

interface ReportFiltersProps {
  readonly reportType: ReportType
  readonly values: ReportFilterValues
  /** Client-side field issues computed before sending, keyed by field. */
  readonly clientIssues: Partial<Record<FilterField, string>>
  /** Settled protected result carrying server (HTTP 422) field issues. */
  readonly result: ProtectedResult<unknown> | null
  /** Safe general status message for unassociated issues. */
  readonly statusMessage: string | undefined
  readonly pending: boolean
  readonly onChange: (field: FilterField, value: string) => void
  readonly onSubmit: () => void
}

export function ReportFilters({
  reportType,
  values,
  clientIssues,
  result,
  statusMessage,
  pending,
  onChange,
  onSubmit,
}: ReportFiltersProps) {
  const fields = FILTER_FIELDS[reportType]

  return (
    <div
      aria-label="Filtros del reporte"
      className="min-w-0 space-y-4 rounded-lg border p-4"
      role="group"
    >
      {fields.map((definition) => {
        const controlId = `report-${definition.field}`
        const errorId = `${controlId}-error`
        // A client-side issue takes precedence; otherwise fall back to a
        // server-associated field issue from an HTTP 422 result.
        const error =
          clientIssues[definition.field] ??
          fieldIssueMessage(result, definition.field)

        return (
          <div className="space-y-2" key={definition.field}>
            <Label htmlFor={controlId}>
              {definition.label}
              {definition.required ? " *" : ""}
            </Label>
            <Input
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error ? true : undefined}
              id={controlId}
              onChange={(event) =>
                onChange(definition.field, event.target.value)
              }
              type={definition.kind === "date" ? "date" : "text"}
              value={values[definition.field]}
            />
            {error ? (
              <Alert aria-live="assertive" id={errorId} variant="destructive">
                {error}
              </Alert>
            ) : null}
          </div>
        )
      })}

      <StatusRegion message={statusMessage} tone="error" />

      <div className="flex flex-wrap gap-2">
        <ActionActivation
          className="inline-flex h-9 items-center rounded-4xl bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
          disabled={pending}
          onActivate={onSubmit}
        >
          {pending ? "Consultando…" : "Consultar"}
        </ActionActivation>
      </div>
    </div>
  )
}

export default ReportFilters
