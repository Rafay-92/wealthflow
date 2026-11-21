import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * A confirmation dialog built on the native <dialog> element, which gives us
 * focus trapping, Escape-to-close and a backdrop for free.
 * (We never use window.confirm(): it can't be styled and blocks the whole page.)
 */
export function ConfirmDialog({ open, title, children, confirmLabel, danger, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault() // let React state control closing
        if (!busy) onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-navy-600 bg-navy-800 p-6 text-ink shadow-2xl backdrop:bg-navy-950/75 backdrop:backdrop-blur-sm"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-sm text-ink-muted">{children}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy} autoFocus>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
