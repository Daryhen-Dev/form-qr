"use client"

import { useState } from "react"

import { LoginForm } from "@/components/auth/login-form"
import { PasswordChangeForm } from "@/components/auth/password-change-form"
import {
  ACCESS_AVAILABILITY,
  ACCESS_ROLE,
  useAccess,
  type AccessRole,
} from "@/components/access/access-provider"
import { StatusRegion } from "@/components/access/status-region"

function QrDecoration() {
  return (
    <div aria-hidden="true" className="flex gap-1.5">
      <span className="grid size-9 grid-cols-3 gap-px rounded-sm bg-muted p-1">
        <span className="col-span-2 row-span-2 bg-primary" />
        <span className="bg-primary" />
        <span className="bg-primary" />
      </span>
      <span className="grid size-9 grid-cols-3 gap-px rounded-sm bg-muted p-1">
        <span className="col-span-2 bg-primary" />
        <span className="row-span-2 bg-primary" />
        <span className="bg-primary" />
        <span className="bg-primary" />
      </span>
      <span className="grid size-9 grid-cols-3 gap-px rounded-sm bg-muted p-1">
        <span className="bg-primary" />
        <span className="col-span-2 row-span-2 bg-primary" />
        <span className="bg-primary" />
        <span className="bg-primary" />
      </span>
    </div>
  )
}

function AccessCard({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh w-full items-center bg-background px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full min-w-0 max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        {children}
      </section>
    </main>
  )
}

function LoginScreen({ message }: { message: string | undefined }) {
  return (
    <AccessCard>
      <header className="mb-8 space-y-4">
        <QrDecoration />
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Form QR</p>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Iniciar sesión</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Ingrese sus credenciales para acceder a los formularios asignados.
          </p>
        </div>
      </header>
      <div className="space-y-5">
        <StatusRegion message={message} tone="error" />
        <LoginForm />
      </div>
    </AccessCard>
  )
}

function PasswordChangeScreen({
  accessToken,
  onComplete,
}: {
  accessToken: string
  onComplete: (message?: string) => void
}) {
  return (
    <AccessCard>
      <PasswordChangeForm accessToken={accessToken} onComplete={onComplete} />
    </AccessCard>
  )
}


function RoleStart({ role }: { role: AccessRole }) {
  const isEmployee = role === ACCESS_ROLE.EMPLEADO

  return (
    <AccessCard>
      <div className="space-y-4">
        <QrDecoration />
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {isEmployee ? "Cuestionarios asignados" : "Operaciones"}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {isEmployee
              ? "Abra el enlace QR asignado para completar su cuestionario diario."
              : "Seleccione una operación autorizada para continuar."}
          </p>
        </div>
        <StatusRegion message="Acceso habilitado." />
      </div>
    </AccessCard>
  )
}

export function AccessShell() {
  const { access, clearAccess } = useAccess()
  const [returnMessage, setReturnMessage] = useState<string>()

  function handlePasswordChangeComplete(message?: string) {
    clearAccess()
    setReturnMessage(message)
  }

  if (access === undefined) {
    return <LoginScreen message={returnMessage} />
  }

  if (access.availability === ACCESS_AVAILABILITY.RESTRICTED) {
    return (
      <PasswordChangeScreen
        accessToken={access.accessToken}
        onComplete={handlePasswordChangeComplete}
      />
    )
  }

  return <RoleStart role={access.role} />
}
