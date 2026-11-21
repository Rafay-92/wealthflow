import {
  ArrowLeftRight,
  BarChart3,
  FileText,
  Landmark,
  LayoutDashboard,
  Repeat,
  Settings,
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
  description: string
  icon: LucideIcon
  /** The development stage in which this page gets built. */
  stage: number
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    path: '/',
    label: 'Dashboard',
    description: 'Your monthly income, spending and savings at a glance.',
    icon: LayoutDashboard,
    stage: 2,
  },
  {
    path: '/upload',
    label: 'Import',
    description: 'Import a CSV bank statement. Files are processed on this device only.',
    icon: Upload,
    stage: 3,
  },
  {
    path: '/transactions',
    label: 'Transactions',
    description: 'Review, search and re-categorize every imported transaction.',
    icon: ArrowLeftRight,
    stage: 4,
  },
  {
    path: '/analytics',
    label: 'Analytics',
    description: 'Spending by category, trends and month-over-month comparisons.',
    icon: BarChart3,
    stage: 5,
  },
  {
    path: '/reports',
    label: 'Reports',
    description: 'Generate a monthly report and export it as a PDF.',
    icon: FileText,
    stage: 6,
  },
  {
    path: '/subscriptions',
    label: 'Subscriptions',
    description: 'Recurring payments and what they cost you each year.',
    icon: Repeat,
    stage: 7,
  },
  {
    path: '/wealth',
    label: 'Wealth',
    description: 'Track assets and liabilities to see your net worth over time.',
    icon: Landmark,
    stage: 8,
  },
  {
    path: '/settings',
    label: 'Settings',
    description: 'Categorization rules, data management and deleting your data.',
    icon: Settings,
    stage: 10,
  },
]
