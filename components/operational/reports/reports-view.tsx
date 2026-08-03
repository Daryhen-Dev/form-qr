"use client"

import { useState } from "react"

import { useAccess } from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"
import { ActionActivation } from "@/components/operational/action-activation"
import {
  generalIssueMessage,
  operationFeedback,
} from "@/components/operational/admin/operation-feedback"
import { PaginatedResults } from "@/components/operational/reports/paginated-results"
import {
  clientFilterIssues,
  EMPTY_REPORT_FILTERS,
  REPORT_TYPE,
  ReportFilters,
  type ReportFilterValues,
  type ReportType,
} from "@/components/operational/reports/report-filters"
import {
  isProtectedSuccess,
  type ComplianceReportDTO,
  type HistoryReportDTO,
  type PendingReportDTO,
} from "@/lib/operational-api/contracts"
import {
  createOperationStates,
  getOperation,
  isOperationPending,
  OPERATION_STATUS,
  settleOperation,
  startOperation,
  type OperationStates,
} from "@/lib/operational-api/operation-state"
import {
  fetchComplianceReport,
  fetchHistoryReport,
  fetchPendingReport,
} from "@/lib/operational-api/reports"
import { PAGE_MIN } from "@/lib/operational-api/report-query"

/**
 * Reports surface for Administrador and Secretario.
 *
 * `RoleRouteGate` matches internal routes exactly and only `/operaciones/reportes`
 * is an authorized route, so the three report queries (pending, compliance,
 * history) are composed as embedded views selected here rather than across
 * unreachable sub-routes — keeping the authorized surface intact (Property 1).
 *
 * A single protected operation drives every query: it is presented as pending
 * and blocks re-activation until it settles (Requirement 7.1). Entered filters
 * always live in local state, so when the Existing API Contract answers HTTP
 * 422 the values are preserved and each identifiable issue associates with its
 * control while unassociated issues collapse into one safe general message
 * (Requirements 6.7, 7.6, 7.8). Real calendar dates and the inclusive 31-day
 * range are validated client-side before any request (Requirements 6.2-6.5).
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 9.1, 9.2, 9.3, 9.4
 */

const QUERY_OPERATION = "report-query"

type ReportData =
  | { readonly type: typeof REPORT_TYPE.PENDING; readonly data: PendingReportDTO }
  | {
      readonly type: typeof REPORT_TYPE.COMPLIANCE
      readonly data: ComplianceReportDTO
    }
  | { readonly type: typeof REPORT_TYPE.HISTORY; readonly data: HistoryReportDTO }

interface ReportTypeOption {
  readonly value: ReportType
  readonly label: string
}

/** Report types offered, in visual reading order (Requirement 6.1). */
const REPORT_TYPE_OPTIONS: readonly ReportTypeOption[] = [
  { value: REPORT_TYPE.PENDING, label: "Pendientes" },
  { value: REPORT_TYPE.COMPLIANCE, label: "Cumplimiento" },
  { value: REPORT_TYPE.HISTORY, label: "Historial" },
]

/** Map an empty filter string to `undefined` so it is never sent as a filter. */
function optional(value: string): string | undefined {
  return value.length > 0 ? value : undefined
}

const SELECTOR_BASE_CLASS =
  "inline-flex h-9 items-center rounded-4xl px-3 text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50"

export function ReportsView() {
  const { access } = useAccess()
  const accessToken = access?.accessToken ?? ""

  const [reportType, setReportType] = useState<ReportType>(REPORT_TYPE.PENDING)
  const [values, setValues] = useState<ReportFilterValues>(EMPTY_REPORT_FILTERS)
  const [clientIssues, setClientIssues] = useState<
    Partial<Record<keyof ReportFilterValues, string>>
  >({})
  const [reportData, setReportData] = useState<ReportData | null>(null)
  const [states, setStates] = useState<OperationStates>(createOperationStates)

  const operation = getOperation(states, QUERY_OPERATION)
  const pending = isOperationPending(states, QUERY_OPERATION)
  const feedback = operationFeedback(operation)
  const generalMessage = generalIssueMessage(operation.result)
  const successMessage =
    operation.status === OPERATION_STATUS.SUCCESS ? feedback.message : undefined

  function selectType(next: ReportType) {
    if (next === reportType) {
      return
    }

    setReportType(next)
    setValues(EMPTY_REPORT_FILTERS)
    setClientIssues({})
    setReportData(null)
    setStates(createOperationStates())
  }

  function changeFilter(field: keyof ReportFilterValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    // Clearing the edited field's client issue keeps the association in sync
    // as the user corrects it; server issues are refreshed on the next query.
    setClientIssues((current) => {
      if (current[field] === undefined) {
        return current
      }
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function runQuery(requestedPage: number) {
    const issues = clientFilterIssues(reportType, values)
    setClientIssues(issues)
    if (Object.keys(issues).length > 0) {
      // Client validation failed: preserve entered values and issue no request.
      return
    }

    const { started, states: nextStates } = startOperation(
      states,
      QUERY_OPERATION
    )
    if (!started) {
      return
    }
    setStates(nextStates)

    if (reportType === REPORT_TYPE.PENDING) {
      const result = await fetchPendingReport(accessToken, {
        businessDay: values.businessDay,
        branchId: optional(values.branchId),
        questionnaireId: optional(values.questionnaireId),
      })
      setStates((current) => settleOperation(current, QUERY_OPERATION, result))
      if (isProtectedSuccess(result)) {
        setReportData({ type: REPORT_TYPE.PENDING, data: result.data })
      }
      return
    }

    if (reportType === REPORT_TYPE.COMPLIANCE) {
      const result = await fetchComplianceReport(accessToken, {
        from: values.from,
        to: optional(values.to),
        branchId: optional(values.branchId),
        questionnaireId: optional(values.questionnaireId),
        page: requestedPage,
      })
      setStates((current) => settleOperation(current, QUERY_OPERATION, result))
      if (isProtectedSuccess(result)) {
        setReportData({ type: REPORT_TYPE.COMPLIANCE, data: result.data })
      }
      return
    }

    const result = await fetchHistoryReport(accessToken, {
      from: values.from,
      to: values.to,
      employeeId: optional(values.employeeId),
      questionnaireId: optional(values.questionnaireId),
      branchId: optional(values.branchId),
      page: requestedPage,
    })
    setStates((current) => settleOperation(current, QUERY_OPERATION, result))
    if (isProtectedSuccess(result)) {
      setReportData({ type: REPORT_TYPE.HISTORY, data: result.data })
    }
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-3xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Reportes
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Consultá el estado diario y el historial de respuestas de los
          cuestionarios asignados.
        </p>
      </header>

      <div
        aria-label="Tipo de reporte"
        className="flex min-w-0 flex-wrap gap-2"
        role="group"
      >
        {REPORT_TYPE_OPTIONS.map((option) => {
          const isActive = option.value === reportType

          return (
            <ActionActivation
              aria-pressed={isActive}
              className={`${SELECTOR_BASE_CLASS} ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-input/30 hover:bg-input/50"
              }`}
              key={option.value}
              onActivate={() => selectType(option.value)}
            >
              {option.label}
            </ActionActivation>
          )
        })}
      </div>

      <ReportFilters
        clientIssues={clientIssues}
        onChange={changeFilter}
        onSubmit={() => void runQuery(PAGE_MIN)}
        pending={pending}
        reportType={reportType}
        result={operation.result}
        statusMessage={generalMessage}
        values={values}
      />

      <StatusRegion message={successMessage} tone="info" />

      {reportData !== null ? (
        <ReportResults
          data={reportData}
          disabled={pending}
          onPageChange={(page) => void runQuery(page)}
        />
      ) : null}
    </section>
  )
}

interface ReportResultsProps {
  readonly data: ReportData
  readonly disabled: boolean
  readonly onPageChange: (page: number) => void
}

/** Renders the settled report payload for the active report type. */
function ReportResults({ data, disabled, onPageChange }: ReportResultsProps) {
  if (data.type === REPORT_TYPE.PENDING) {
    const { pending } = data.data

    return (
      <section aria-label="Empleados pendientes" className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          Día de negocio: {data.data.businessDay} · {pending.length}{" "}
          pendiente(s).
        </p>
        {pending.length === 0 ? (
          <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
            No hay empleados pendientes para el día seleccionado.
          </p>
        ) : (
          <ul className="min-w-0 space-y-2">
            {pending.map((entry) => (
              <li
                className="min-w-0 rounded-lg border px-4 py-3"
                key={`${entry.employeeId}-${entry.questionnaireId}`}
              >
                <p className="truncate text-sm font-medium">
                  {entry.employeeName}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {entry.branchName} · {entry.questionnaireTitle}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  if (data.type === REPORT_TYPE.COMPLIANCE) {
    const { summary, details } = data.data

    return (
      <div className="min-w-0 space-y-4">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ComplianceStat label="Asignados" value={summary.totalAssigned} />
          <ComplianceStat label="Respondidos" value={summary.responded} />
          <ComplianceStat label="Pendientes" value={summary.pending} />
          <ComplianceStat
            label="Cumplimiento"
            value={`${summary.complianceRate}%`}
          />
        </dl>
        <PaginatedResults
          disabled={disabled}
          emptyMessage="No hay registros de cumplimiento para el rango seleccionado."
          itemCount={details.items.length}
          label="Detalle de cumplimiento"
          onPageChange={onPageChange}
          page={details.page}
          pageSize={details.pageSize}
          total={details.total}
        >
          {details.items.map((detail) => (
            <li
              className="min-w-0 rounded-lg border px-4 py-3"
              key={`${detail.employeeId}-${detail.questionnaireId}-${detail.businessDay}`}
            >
              <p className="truncate text-sm font-medium">
                {detail.employeeName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {detail.branchName} · {detail.questionnaireTitle} ·{" "}
                {detail.businessDay} ·{" "}
                {detail.responded ? "Respondido" : "Pendiente"}
              </p>
            </li>
          ))}
        </PaginatedResults>
      </div>
    )
  }

  const { results } = data.data

  return (
    <PaginatedResults
      disabled={disabled}
      emptyMessage="No hay respuestas en el historial para el rango seleccionado."
      itemCount={results.items.length}
      label="Historial de respuestas"
      onPageChange={onPageChange}
      page={results.page}
      pageSize={results.pageSize}
      total={results.total}
    >
      {results.items.map((entry) => (
        <li className="min-w-0 rounded-lg border px-4 py-3" key={entry.id}>
          <p className="truncate text-sm font-medium">{entry.employeeName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {entry.questionnaireTitle} · v{entry.versionNumber} ·{" "}
            {entry.businessDay}
          </p>
        </li>
      ))}
    </PaginatedResults>
  )
}

interface ComplianceStatProps {
  readonly label: string
  readonly value: string | number
}

/** Single labelled compliance summary metric. */
function ComplianceStat({ label, value }: ComplianceStatProps) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  )
}

export default ReportsView
