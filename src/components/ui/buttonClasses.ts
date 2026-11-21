export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-positive text-navy-950 hover:brightness-110 font-semibold',
  secondary: 'border border-navy-600 bg-navy-800 text-ink hover:border-ink-faint',
  ghost: 'text-ink-muted hover:bg-navy-700/60 hover:text-ink',
  danger: 'border border-negative/50 text-negative hover:bg-negative-soft',
}

/**
 * Shared button styles, also usable on links: <Link className={buttonClasses('primary')}>.
 * Lives in its own file because React's fast refresh works best when
 * component files export only components.
 */
export function buttonClasses(variant: ButtonVariant = 'secondary', extra = ''): string {
  return `inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-positive ${VARIANTS[variant]} ${extra}`
}
