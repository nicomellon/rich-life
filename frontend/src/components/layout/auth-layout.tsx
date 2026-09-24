import { Outlet } from 'react-router'

/** A centred column for the pages a signed-out user sees: sign in and register. */
export function AuthLayout() {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-6">
        <p className="text-center font-semibold tracking-tight">Rich Life</p>
        <Outlet />
      </div>
    </main>
  )
}
