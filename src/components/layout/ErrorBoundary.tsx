import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Card } from '../ui/Card'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * True when a page's code couldn't be downloaded, which almost always means
 * the program behind WealthFlow (the black window) was closed or restarted,
 * not that your data is broken.
 */
function isLoadFailure(error: Error): boolean {
  return /dynamically imported module|importing a module script failed|error loading dynamically|failed to fetch|outdated optimize dep|chunkloaderror/i.test(
    `${error.name} ${error.message}`,
  )
}

/**
 * Catches a crash while showing a page, so one broken page shows a message
 * instead of a blank screen. (Error boundaries are one of the few things that
 * still need a class component in React.)
 *
 * The error is only logged to this browser's console and shown on screen;
 * nothing is reported anywhere.
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
    const { error } = this.state
    if (!error) return this.props.children
    const loadFailure = isLoadFailure(error)

    return (
      <Card role="alert" className="mx-auto mt-10 max-w-lg py-10 text-center">
        <p className="font-semibold">{loadFailure ? 'This page couldn’t be loaded' : 'Something went wrong on this page'}</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
          {loadFailure
            ? 'WealthFlow’s program (the black window) was probably closed or restarted. Double-click “Open WealthFlow.bat”, then press Reload.'
            : 'Your data is safe: it’s stored separately and wasn’t changed. Try reloading, or go back to the dashboard.'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-positive px-4 py-2 text-sm font-semibold text-navy-950">
            Reload
          </button>
          <a href="/" className="rounded-lg border border-navy-600 px-4 py-2 text-sm font-medium">
            Dashboard
          </a>
        </div>
        <details className="mx-auto mt-6 max-w-sm text-left text-xs text-ink-faint">
          <summary className="cursor-pointer text-center">Technical details (useful if you report this)</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-navy-900 p-3 whitespace-pre-wrap">{`${error.name}: ${error.message}`}</pre>
        </details>
      </Card>
    )
  }
}
