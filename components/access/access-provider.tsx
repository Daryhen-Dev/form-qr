"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export const ACCESS_ROLE = {
  ADMINISTRADOR: "Administrador",
  SECRETARIO: "Secretario",
  EMPLEADO: "Empleado",
} as const

export type AccessRole = (typeof ACCESS_ROLE)[keyof typeof ACCESS_ROLE]

export const ACCESS_AVAILABILITY = {
  AVAILABLE: "available",
  RESTRICTED: "restricted",
} as const

export type AccessAvailability =
  (typeof ACCESS_AVAILABILITY)[keyof typeof ACCESS_AVAILABILITY]

export interface AccessContext {
  accessToken: string
  principalId: string
  role: AccessRole
  availability: AccessAvailability
}

export interface AccessProviderValue {
  access: AccessContext | undefined
  setAccess: (access: AccessContext) => void
  clearAccess: () => void
}

interface AccessProviderProps {
  children: ReactNode
}

interface LoginAccessCandidate {
  accessToken: string
  user: Record<string, unknown>
  availability: AccessAvailability
}

const AccessContextStore = createContext<AccessProviderValue | undefined>(undefined)

export function isAccessRole(value: unknown): value is AccessRole {
  return Object.values(ACCESS_ROLE).includes(value as AccessRole)
}

export function createAccessContext(
  candidate: LoginAccessCandidate
): AccessContext | undefined {
  const principalId = candidate.user.id
  const role = candidate.user.role

  if (
    typeof principalId !== "string" ||
    principalId.length === 0 ||
    !isAccessRole(role)
  ) {
    return undefined
  }


  return {
    accessToken: candidate.accessToken,
    principalId,
    role,
    availability: candidate.availability,
  }
}

export function AccessProvider({ children }: AccessProviderProps) {
  const [access, setAccess] = useState<AccessContext>()

  function clearAccess() {
    setAccess(undefined)
  }

  return (
    <AccessContextStore.Provider value={{ access, setAccess, clearAccess }}>
      {children}
    </AccessContextStore.Provider>
  )
}

export function useAccess(): AccessProviderValue {
  const value = useContext(AccessContextStore)

  if (value === undefined) {
    throw new Error("useAccess must be used inside AccessProvider")
  }

  return value
}

export function useOptionalAccess(): AccessProviderValue | undefined {
  return useContext(AccessContextStore)
}
