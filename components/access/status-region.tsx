import { Alert } from "@/components/ui/alert"

const STATUS_TONE = {
  INFO: "info",
  ERROR: "error",
} as const

type StatusTone = (typeof STATUS_TONE)[keyof typeof STATUS_TONE]

interface StatusRegionProps {
  message: string | undefined
  tone?: StatusTone
}

export function StatusRegion({
  message,
  tone = STATUS_TONE.INFO,
}: StatusRegionProps) {
  if (message === undefined) {
    return null
  }

  return (
    <Alert
      aria-atomic="true"
      aria-live="polite"
      role="status"
      variant={tone === STATUS_TONE.ERROR ? "destructive" : "default"}
    >
      {message}
    </Alert>
  )
}
