import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-copper/70',
        pressed ? 'border-copper bg-copper text-ink' : 'border-white/15 text-paper hover:bg-white/10',
      )}
    >
      {children}
    </button>
  )
}

export function Field({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-baseline justify-between gap-3 text-xs text-mist">
        <span>{label}</span>
        <span className="tabular-nums text-paper">{value}</span>
      </span>
      {children}
    </label>
  )
}

export function ProgressBar({ ratio }: { ratio?: number }) {
  const indeterminate = ratio === undefined
  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-white/10"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(ratio * 100)}
    >
      <div
        className={cn('h-full rounded-full bg-copper transition-[width] duration-200', indeterminate && 'w-1/3 animate-pulse')}
        style={indeterminate ? undefined : { width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  )
}

export function Viewfinder({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_80px_rgba(0,0,0,0.35)]', className)}>
      <div className="pointer-events-none absolute inset-3 z-10">
        <span className="absolute top-0 left-0 h-5 w-5 border-t-2 border-l-2 border-copper/80" />
        <span className="absolute top-0 right-0 h-5 w-5 border-t-2 border-r-2 border-copper/80" />
        <span className="absolute bottom-0 left-0 h-5 w-5 border-b-2 border-l-2 border-copper/80" />
        <span className="absolute right-0 bottom-0 h-5 w-5 border-r-2 border-b-2 border-copper/80" />
      </div>
      {children}
    </div>
  )
}
