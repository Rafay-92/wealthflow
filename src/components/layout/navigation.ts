import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  Landmark,
  LayoutDashboard,
  Repeat,
  Settings,
  Sparkles,
  Upload,
  type LucideIcon,
} from 'lucide-react'

/**
 * Single source of truth for the app's pages.
 * The sidebar and the router both read from this list,
 * so adding a page means adding one entry here.
 */
export interface NavItem {
  path: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    path: '/upload',
    label: 'Import',
    icon: Upload,
  },
  {
    path: '/transactions',
    label: 'Transactions',
    icon: ArrowLeftRight,
  },
  {
    path: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
  },
  {
    path: '/insights',
    label: 'Insights',
    icon: Sparkles,
  },
  {
    path: '/reports',
    label: 'Reports',
    icon: FileText,
  },
  {
    path: '/subscriptions',
    label: 'Subscriptions',
    icon: Repeat,
  },
  {
    path: '/wealth',
    label: 'Wealth',
    icon: Landmark,
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
  },
]
