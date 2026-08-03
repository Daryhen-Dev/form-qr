"use client"

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react"

/**
 * Props for the shared activation control.
 *
 * `onClick` and `type` are owned internally so pointer and keyboard activation
 * paths stay equivalent; consumers may still forward any other native button
 * attribute (label, disabled state, styling, etc.).
 */
export interface ActionActivationProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> {
  /** Invoked exactly once per activation, from pointer or keyboard. */
  onActivate: () => void
  children: ReactNode
  /** Optional ref forwarded to the underlying native button for composition. */
  ref?: Ref<HTMLButtonElement>
}

/**
 * Shared, reusable activation control for protected operations.
 *
 * Renders a native button so that pointer clicks, Enter, and Space all trigger
 * the exact same single activation with the same observable result, keeping
 * keyboard and pointer paths equivalent (Requirements 9.2, 9.6).
 */
export function ActionActivation({
  onActivate,
  children,
  ref,
  ...buttonProps
}: ActionActivationProps) {
  return (
    <button type="button" onClick={onActivate} ref={ref} {...buttonProps}>
      {children}
    </button>
  )
}

export default ActionActivation
