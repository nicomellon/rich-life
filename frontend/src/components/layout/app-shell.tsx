import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { useAuth, useCurrentUser } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/plan', label: 'Spending plan', end: false },
]

export function AppShell() {
  const { signOut } = useAuth()
  const { data: currentUser } = useCurrentUser()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <NavLink to="/" className="font-semibold tracking-tight">
            Rich Life
          </NavLink>
          <nav aria-label="Main" className="flex gap-1 text-sm">
            {navItems.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 transition-colors hover:bg-accent',
                    isActive ? 'bg-accent font-medium' : 'text-muted-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{currentUser?.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
