import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Card } from '../ui/Card'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a crash while rendering a page, so one broken page shows a message
 * instead of a blank screen. (Error boundaries are one of the few things that
 * still need a class component in React.)
 *
 * The error is only logged to this browser's console: nothing is reported anywhere.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[WealthFlow] Page crashed', error, info.componentStack)
  }

  override render() {
    if (!this.state.error) return this.props.children
    return (
      <Card role="alert" className="mx-auto mt-10 max-w-lg py-10 text-center">
        <p className="font-semibold">Something went wrong on this page</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          Your data is safe: it's stored separately and wasn't changed. Try reloading, or go back to the dashboard.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-navy-950">
            Reload
          </button>
          <a href="/" className="rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium">
            Dashboard
          </a>
        </div>
      </Card>
    )
  }
}
