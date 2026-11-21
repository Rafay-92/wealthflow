import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { NAV_ITEMS } from './components/layout/navigation'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { ReportsPage } from './pages/ReportsPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { UploadPage } from './pages/UploadPage'

/** Pages that have been built. Any route not listed here shows its placeholder. */
const PAGES: Record<string, ReactNode> = {
  '/': <DashboardPage />,
  '/upload': <UploadPage />,
  '/transactions': <TransactionsPage />,
  '/analytics': <AnalyticsPage />,
  '/reports': <ReportsPage />,
}

/**
 * Maps URLs to pages. Every route is nested inside <AppShell>, so they all
 * share the sidebar.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV_ITEMS.map((item) => (
          <Route
            key={item.path}
            path={item.path}
            element={PAGES[item.path] ?? <PlaceholderPage item={item} />}
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
