import { LoginForm } from "@/components/auth/login-form"

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

export default function Home() {
  return (
    <main className="flex min-h-svh w-full items-center bg-background px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full min-w-0 max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
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
        <LoginForm />
      </section>
    </main>
  )
}
