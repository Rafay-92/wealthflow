import { Menu, X } from 'lucide-react'
import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { ErrorBoundary } from './ErrorBoundary'
import { NAV_ITEMS } from './navigation'
import { Logo, Sidebar } from './Sidebar'

/**
 * The frame around every page.
 * - Desktop (lg and up): fixed sidebar on the left.
 * - Mobile: a top bar with a menu button that opens the sidebar as a drawer.
 * <Outlet /> is where React Router renders the current page.
 */
export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()

  // Scroll back to the top and name the browser tab after the page.
  useEffect(() => {
    window.scrollTo(0, 0)
    const page = NAV_ITEMS.find((item) => item.path === pathname)
    document.title = page && page.path !== '/' ? `${page.label} · WealthFlow` : 'WealthFlow'
  }, [pathname])

  // Let the Escape key close the mobile drawer.
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  return (
    <div className="min-h-svh lg:pl-64">
      {/* Lets keyboard users jump past the navigation. Invisible until focused with Tab. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-positive focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-navy-950"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-navy-600/50 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-navy-600/50 bg-navy-900/90 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-ink-muted hover:bg-navy-800 hover:text-ink"
        >
          <Menu className="size-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {/* `inert` when closed: hidden links must not be reachable with Tab either. */}
      <div className={`fixed inset-0 z-30 lg:hidden ${drawerOpen ? '' : 'pointer-events-none'}`} inert={!drawerOpen}>
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-navy-950/70 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl transition-transform duration-200 ease-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
            className="absolute top-5 right-3 z-10 rounded-lg p-2 text-ink-muted hover:bg-navy-800 hover:text-ink"
          >
            <X className="size-5" />
          </button>
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </aside>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 outline-none sm:px-6 lg:px-10 lg:py-10">
        {/* key={pathname}: navigating away from a crashed page resets the boundary. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
