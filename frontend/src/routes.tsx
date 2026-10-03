import type { RouteObject } from 'react-router'
import { RequireAuth, RequireSignedOut } from '@/auth/route-guards'
import { AppShell } from '@/components/layout/app-shell'
import { AuthLayout } from '@/components/layout/auth-layout'
import { DashboardPage } from '@/pages/dashboard-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { PlanPage } from '@/pages/plan-page'
import { RegisterPage } from '@/pages/register-page'
import { RequestSignInLinkPage } from '@/pages/request-sign-in-link-page'
import { SignInLinkPage } from '@/pages/sign-in-link-page'
import { SignInPage } from '@/pages/sign-in-page'

export const routes: RouteObject[] = [
  {
    element: <RequireSignedOut />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: 'sign-in', element: <SignInPage /> },
          { path: 'sign-in/email', element: <RequestSignInLinkPage /> },
          { path: 'register', element: <RegisterPage /> },
        ],
      },
    ],
  },
  // Outside both guards: it signs the user in, then stays to offer adding a passkey.
  {
    element: <AuthLayout />,
    children: [{ path: 'sign-in/link', element: <SignInLinkPage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'plan', element: <PlanPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]
