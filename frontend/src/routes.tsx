import type { RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/app-shell'
import { DashboardPage } from '@/pages/dashboard-page'
import { NotFoundPage } from '@/pages/not-found-page'
import { PlanPage } from '@/pages/plan-page'

export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
