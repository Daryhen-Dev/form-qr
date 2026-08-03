"use client"

import type { ReactNode } from "react"

import { Pagination } from "@/components/operational/reports/pagination"

/**
 * Presentational shell for a paginated report result set.
 *
 * Renders the pagination metadata (page number, page size and total reported
 * by the Existing API Contract) alongside the projected rows, and delegates
 * the page controls to `Pagination`, which only ever requests a valid page
 * (Requirement 6.6). Rows are provided by the caller so this component stays
 * agnostic to the specific report DTO.
 *
 * The results live in an accessible region with a descriptive label; an empty
 * result set surfaces a safe, informative message instead of blank space.
 *
 * Validates: Requirements 6.6, 9.1
 */

interface PaginatedResultsProps {
  /** Accessible label for the results region. */
  readonly label: string
  /** Current 1-based page reported by the API response. */
  readonly page: number
  /** Page size reported by the API response. */
  readonly pageSize: number
  /** Total item count reported by the API response. */
  readonly total: number
  /** Number of rows currently rendered (used for the empty state). */
  readonly itemCount: number
  /** Message shown when the current page holds no rows. */
  readonly emptyMessage: string
  /** Blocks navigation while a report query is in flight. */
  readonly disabled?: boolean
  /** Requests a specific, already-validated page. */
  readonly onPageChange: (page: number) => void
  /** Projected rows for the current page. */
  readonly children: ReactNode
}

export function PaginatedResults({
  label,
  page,
  pageSize,
  total,
  itemCount,
  emptyMessage,
  disabled = false,
  onPageChange,
  children,
}: PaginatedResultsProps) {
  return (
    <section aria-label={label} className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} resultado(s) · {pageSize} por página · mostrando {itemCount} en
        esta página.
      </p>

      {itemCount === 0 ? (
        <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <ul className="min-w-0 space-y-2">{children}</ul>
      )}

      <Pagination
        disabled={disabled}
        onPageChange={onPageChange}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </section>
  )
}

export default PaginatedResults
