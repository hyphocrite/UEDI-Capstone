import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Props = {
  /** 1-based. */
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}

/**
 * Page controls for a list: numbers and arrows only. The words are for screen readers.
 * Hidden when everything fits on one page. On phones only the arrows next to the current
 * page and its neighbours show, so it stays on one line.
 */
export default function Pagination({ page, pageSize, total, onPage }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const current = Math.min(Math.max(1, page), pages)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)

  // 1 … (current − 1) current (current + 1) … last, or every page when there are few.
  const shown: (number | 'gap')[] = []
  const want = pages <= 7 ? Array.from({ length: pages }, (_, i) => i + 1) : [...new Set([1, current - 1, current, current + 1, pages])].filter((n) => n >= 1 && n <= pages)
  want.forEach((n, i) => {
    if (i > 0 && n - want[i - 1] > 1) shown.push('gap')
    shown.push(n)
  })
  // Below sm only the current page and its neighbours.
  const outer = (n: number) => Math.abs(n - current) > 1

  // display: 'inline-flex', or 'hidden sm:inline-flex' for the first/last arrows.
  const arrow = (Icon: LucideIcon, label: string, target: number, disabled: boolean, display = 'inline-flex') => (
    <button type="button" aria-label={label} disabled={disabled} onClick={() => onPage(target)}
      className={`${display} h-8 w-8 items-center justify-center rounded-lg text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent`}>
      <Icon className="h-4 w-4" />
    </button>
  )

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-brand-100 px-4 py-3">
      <div className="flex items-center gap-0.5">
        {arrow(ChevronsLeft, 'First page', 1, current === 1, 'hidden sm:inline-flex')}
        {arrow(ChevronLeft, 'Previous page', current - 1, current === 1)}
        {shown.map((n, i) =>
          n === 'gap' ? (
            <span key={`gap${i}`} aria-hidden className="hidden w-6 text-center text-sm text-brand-400 sm:inline-block">…</span>
          ) : (
            <button key={n} type="button" aria-label={`Page ${n}`} aria-current={n === current ? 'page' : undefined} onClick={() => onPage(n)}
              className={`h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular-nums transition ${
                n === current ? 'inline-flex bg-brand-800 text-white' : `text-brand-700 hover:bg-brand-50 ${outer(n) ? 'hidden sm:inline-flex' : 'inline-flex'}`
              }`}>
              {n}
            </button>
          ),
        )}
        {arrow(ChevronRight, 'Next page', current + 1, current === pages)}
        {arrow(ChevronsRight, 'Last page', pages, current === pages, 'hidden sm:inline-flex')}
      </div>
      <p className="text-xs text-brand-500 tabular-nums" aria-live="polite">
        {from}–{to} / {total}
      </p>
    </nav>
  )
}
