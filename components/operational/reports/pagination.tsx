"use client"

import { ActionActivation } from "@/components/operational/action-activation"
import { PAGE_MIN } from "@/lib/operational-api/report-query"

/**
 * Pagination controls for the paginated report endpoints.
 *
 * Presents the current page position and only ever requests a page within the
 * valid `[PAGE_MIN, totalPages]` range (Requirement 6.6): the previous/next
 * controls are disabled at the bounds and every emitted page is clamped, so a
 * consumer can never ask the Existing API Contract for an out-of-range page.
 *
 * Activation goes through `ActionActivation`, keeping pointer and keyboard
 * paths equivalent (Requirements 9.2, 9.6). The controls carry descriptive
 * accessible names (Requirement 9.2).
 *
 * Validates: Requirements 6.6, 9.1, 9.2, 9.6
 */

interface PaginationProps {
  /** Current 1-based page number reported by the API response. */
  readonly page: number
  /** Page size reported by the API response. */
  readonly pageSize: number
  /** Total item count reported by the API response. */
  readonly total: number
  /** Blocks navigation while a report query is in flight. */
  readonly disabled?: boolean
  /** Requests a specific, already-validated page. */
  readonly onPageChange: (page: number) => void
}

/** Total number of pages for a size/total pair, never below one. */
function totalPages(pageSize: number, total: number): number {
  if (pageSize <= 0 || total <= 0) {
    return PAGE_MIN
  }

  return Math.max(PAGE_MIN, Math.ceil(total / pageSize))
}

/** Clamp a requested page into the valid `[PAGE_MIN, pages]` range. */
function clampPage(requested: number, pages: number): number {
  if (requested < PAGE_MIN) {
    return PAGE_MIN
  }
  if (requested > pages) {
    return pages
  }
  return requested
}

const CONTROL_CLASS =
  "inline-flex h-8 items-center rounded-4xl border border-border bg-input/30 px-3 text-sm font-medium hover:bg-input/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"

export function Pagination({
  page,
  pageSize,
  total,
  disabled = false,
  onPageChange,
}: PaginationProps) {
  const pages = totalPages(pageSize, total)
  const current = clampPage(page, pages)
  const canGoPrevious = current > PAGE_MIN
  const canGoNext = current < pages

  function goTo(requested: number) {
    const next = clampPage(requested, pages)
    if (next !== current) {
      onPageChange(next)
    }
  }

  return (
    <nav
      aria-label="Paginación de resultados"
      className="flex flex-wrap items-center gap-2"
    >
      <ActionActivation
        aria-label="Página anterior"
        className={CONTROL_CLASS}
        disabled={disabled || !canGoPrevious}
        onActivate={() => goTo(current - 1)}
      >
        Anterior
      </ActionActivation>
      <span aria-live="polite" className="text-sm text-muted-foreground">
        Página {current} de {pages}
      </span>
      <ActionActivation
        aria-label="Página siguiente"
        className={CONTROL_CLASS}
        disabled={disabled || !canGoNext}
        onActivate={() => goTo(current + 1)}
      >
        Siguiente
      </ActionActivation>
    </nav>
  )
}

export default Pagination
