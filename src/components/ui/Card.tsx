import type { HTMLAttributes } from 'react'

/**
 * The base surface for dashboard content.
 * Accepts every normal <div> prop, so callers can add className, onClick, etc.
 */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-navy-600/50 bg-navy-800 p-6 ${className}`}
      {...props}
    />
  )
}
