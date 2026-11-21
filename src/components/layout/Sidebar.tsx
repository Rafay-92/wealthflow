import { ShieldCheck } from 'lucide-react'
import { NavLink } from 'react-router'
import { NAV_ITEMS } from './navigation'

interface SidebarProps {
  /** Called after a link is clicked — used to close the mobile drawer. */
  onNavigate?: () => void
}

export function Sidebar({ onNavigate }: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-navy-900 px-4 py-6">
      <Logo />

      <nav aria-label="Main" className="mt-8 flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-navy-700 text-ink'
                  : 'text-ink-muted hover:bg-navy-800 hover:text-ink',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  aria-hidden
                  className={`size-[18px] transition-colors ${isActive ? 'text-positive' : 'text-ink-faint group-hover:text-ink-muted'}`}
                />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="flex items-start gap-2.5 rounded-lg border border-navy-600/60 p-3 text-xs leading-relaxed text-ink-faint">
        <ShieldCheck aria-hidden className="mt-px size-4 shrink-0 text-positive" />
        <p>Your data stays on this device. Nothing is uploaded.</p>
      </div>
    </div>
  )
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="grid size-8 place-items-center rounded-lg bg-positive-soft">
        <svg viewBox="0 0 24 24" aria-hidden className="size-5 text-positive">
          <path
            d="M3 17l5-5 4 4 8-9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <span className="text-[17px] font-semibold tracking-tight">WealthFlow</span>
    </div>
  )
}
