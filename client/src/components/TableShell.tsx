import type { ReactNode, Ref } from 'react'

type Props = {
  /** Read by screen readers only. */
  caption: string
  /** Usually <Pagination>. Sits outside the scroll box so it is always visible. */
  footer?: ReactNode
  /** 'tall' (default): the table scrolls inside its card and never grows past the screen. 'none': printable pages. */
  maxHeight?: 'tall' | 'none'
  /** From usePaged: scrolled into view after a page change. */
  anchor?: Ref<HTMLDivElement>
  tableClassName?: string
  /** <thead>, <tbody>, <tfoot>. */
  children: ReactNode
}

/**
 * The one wrapper for data tables: a scroll box with a sticky header (and, on phones, a sticky first
 * column), compact rows (the cell / cell-num utilities) and the pager underneath. See .table-shell in index.css.
 */
export default function TableShell({ caption, footer, maxHeight = 'tall', anchor, tableClassName = 'w-full text-sm', children }: Props) {
  return (
    <div ref={anchor} className="min-w-0 scroll-mt-4">
      <div className={`table-shell overflow-auto ${maxHeight === 'tall' ? 'max-h-[min(70vh,40rem)]' : ''}`}>
        <table className={tableClassName}>
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
      {footer}
    </div>
  )
}
