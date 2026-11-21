import { lazy, type ComponentType } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { NAV_ITEMS } from './components/layout/navigation'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'

/**
 * Route-level code splitting: each page except the dashboard (the first
 * thing you see) is a separate file the browser downloads only when you
 * first visit it. `lazy` + the <Suspense> in AppShell make that work.
 */
function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const PAGES: Record<string, ComponentType> = {
  '/': DashboardPage,
  '/upload': lazyPage(() => import('./pages/UploadPage'), 'UploadPage'),
  '/transactions': lazyPage(() => import('./pages/TransactionsPage'), 'TransactionsPage'),
  '/analytics': lazyPage(() => import('./pages/AnalyticsPage'), 'AnalyticsPage'),
  '/insights': lazyPage(() => import('./pages/InsightsPage'), 'InsightsPage'),
  '/reports': lazyPage(() => import('./pages/ReportsPage'), 'ReportsPage'),
  '/subscriptions': lazyPage(() => import('./pages/SubscriptionsPage'), 'SubscriptionsPage'),
  '/wealth': lazyPage(() => import('./pages/WealthPage'), 'WealthPage'),
  '/settings': lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage'),
}

/** Maps URLs to pages. Every route is nested inside <AppShell>, so they all share the sidebar. */
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {NAV_ITEMS.map(({ path }) => {
          const Page = PAGES[path]!
          return <Route key={path} path={path} element={<Page />} />
        })}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
