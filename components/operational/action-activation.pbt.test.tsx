// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import fc from "fast-check"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ActionActivation } from "./action-activation"

const ACTION_LABEL = "Procesar operación"
const ACTION_VALUE_ALPHABET = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
] as const

const actionValues = fc
  .array(fc.constantFrom(...ACTION_VALUE_ALPHABET), { minLength: 1, maxLength: 64 })
  .map((characters) => characters.join(""))

type Activation = "pointer" | "enter" | "space"

interface ActionHarnessProps {
  value: string
  onActivation: (value: string) => void
}

interface ActivationSnapshot {
  invocations: string[]
  observableResult: string | null
}

function ActionHarness({ value, onActivation }: ActionHarnessProps) {
  const [observableResult, setObservableResult] = useState<string | null>(null)

  function activate() {
    onActivation(value)
    setObservableResult(`Procesado: ${value}`)
  }

  return (
    <>
      <ActionActivation onActivate={activate}>{ACTION_LABEL}</ActionActivation>
      <output aria-label="Resultado observable">{observableResult}</output>
    </>
  )
}

async function runActivation(
  value: string,
  activation: Activation
): Promise<ActivationSnapshot> {
  const onActivation = vi.fn<(value: string) => void>()
  const user = userEvent.setup({ delay: null })
  const { unmount } = render(<ActionHarness value={value} onActivation={onActivation} />)

  try {
    const action = screen.getByRole("button", { name: ACTION_LABEL })

    if (activation === "pointer") {
      await user.click(action)
    } else {
      action.focus()
      await user.keyboard(activation === "enter" ? "{Enter}" : "[Space]")
    }

    return {
      invocations: onActivation.mock.calls.map(([activatedValue]) => activatedValue),
      observableResult: screen.getByLabelText("Resultado observable").textContent,
    }
  } finally {
    unmount()
  }
}

afterEach(() => {
  cleanup()
})

describe("Property 7", () => {
  it("invokes the same operation and produces the same observable result for pointer, Enter, and Space", async () => {
    // Feature: operational-web-application, Property 7: Equivalencia de activación
    await fc.assert(
      fc.asyncProperty(actionValues, async (value: string) => {
        const pointerSnapshot = await runActivation(value, "pointer")
        const enterSnapshot = await runActivation(value, "enter")
        const spaceSnapshot = await runActivation(value, "space")

        expect(pointerSnapshot).toEqual({
          invocations: [value],
          observableResult: `Procesado: ${value}`,
        })
        expect(enterSnapshot).toEqual(pointerSnapshot)
        expect(spaceSnapshot).toEqual(pointerSnapshot)
      }),
      { numRuns: 100 }
    )
  }, 30000)
})
