import { AlertCircle, FileUp } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  onReject: (message: string) => void
  error?: string | null
  busy?: boolean
}

/**
 * Drag-and-drop area that is also a normal button, so it works with a
 * keyboard and screen readers, not only a mouse.
 */
export function DropZone({ onFile, onReject, error, busy }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault() // stop the browser opening the file itself
    setDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 1) return onReject('Please drop one file at a time.')
    if (files[0]) onFile(files[0])
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-positive ${
          dragging ? 'border-positive bg-positive-soft' : 'border-navy-600 bg-navy-800/60 hover:border-ink-faint hover:bg-navy-800'
        }`}
      >
        <div className={`grid size-14 place-items-center rounded-2xl transition-colors ${dragging ? 'bg-positive text-navy-950' : 'bg-navy-700 text-positive'}`}>
          <FileUp aria-hidden className="size-6" />
        </div>
        <div>
          <p className="font-medium">{busy ? 'Reading file…' : dragging ? 'Drop to import' : 'Drop a CSV statement here'}</p>
          <p className="mt-1 text-sm text-ink-faint">
            or <span className="font-medium text-positive">browse your files</span> · CSV up to 5 MB
          </p>
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,.txt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = '' // allow choosing the same file again
        }}
      />

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-negative-soft px-4 py-3 text-sm text-negative">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
