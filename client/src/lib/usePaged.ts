import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

/** Rows per page in every paged list and table. */
export const PER_PAGE = 10

type Options = {
  perPage?: number
  /** When this changes (search text, filters, tab), go back to page 1. Compared as JSON. */
  resetKey?: unknown
  /** Keep the page in the query string (?page=2) so a reload or Back keeps it. Full pages only. */
  urlParam?: string
}

/**
 * Client-side paging for a list. Clamps the page when the list shrinks, resets on resetKey, and
 * after a page change scrolls the list's card (pass `anchor` as its ref) into view rather than the window top.
 */
export function usePaged<T>(rows: readonly T[], opts: Options = {}) {
  const perPage = opts.perPage ?? PER_PAGE
  const { urlParam } = opts
  const [params, setParams] = useSearchParams()
  const [statePage, setStatePage] = useState(1)
  // A callback ref (not a ref object), so the element is plain state.
  const [anchorEl, anchor] = useState<HTMLElement | null>(null)

  const raw = urlParam ? Math.max(1, Number(params.get(urlParam)) || 1) : statePage
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const page = Math.min(raw, pages)

  const write = useCallback(
    (n: number) => {
      if (!urlParam) return setStatePage(n)
      setParams((p) => {
        const q = new URLSearchParams(p)
        if (n > 1) q.set(urlParam, String(n))
        else q.delete(urlParam)
        return q
      }, { replace: true })
    },
    [urlParam, setParams],
  )

  const setPage = useCallback(
    (n: number) => {
      write(Math.max(1, n))
      requestAnimationFrame(() => anchorEl?.scrollIntoView({ block: 'nearest' }))
    },
    [write, anchorEl],
  )

  // Back to page 1 when the search or filters change (not on the first render, so ?page= survives a reload).
  const key = JSON.stringify(opts.resetKey ?? null)
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    write(1)
  }, [key, write])

  const pageRows = useMemo(() => rows.slice((page - 1) * perPage, page * perPage), [rows, page, perPage])
  return { page, setPage, pageRows, total, perPage, anchor }
}

/** Which page (1-based) holds the row at `index`. */
export const pageOf = (index: number, perPage = PER_PAGE) => Math.floor(Math.max(0, index) / perPage) + 1
