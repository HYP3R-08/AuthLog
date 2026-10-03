import { useCallback, useEffect, useRef, useState } from 'react'
import { cursorAfter, fetchAccessLogPage, PAGE_SIZE, type AccessLogEntry } from '../lib/accessLog'

interface AccessLogState {
  entries: AccessLogEntry[]
  isLoading: boolean
  isRefreshing: boolean
  isLoadingMore: boolean
  hasMore: boolean
  error: string | null
  refresh: () => void
  loadMore: () => void
}

export function useAccessLog(): AccessLogState {
  const [entries, setEntries] = useState<AccessLogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Guards against a second page request while one is in flight: onEndReached
  // fires repeatedly as the list settles.
  const isFetching = useRef(false)

  const loadFirstPage = useCallback(async (asRefresh: boolean) => {
    if (isFetching.current) return
    isFetching.current = true
    if (asRefresh) setIsRefreshing(true)
    try {
      const page = await fetchAccessLogPage(null)
      setEntries(page)
      setHasMore(page.length === PAGE_SIZE)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Errore sconosciuto')
    } finally {
      isFetching.current = false
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  const loadMore = useCallback(async () => {
    if (isFetching.current || !hasMore || entries.length === 0) return
    isFetching.current = true
    setIsLoadingMore(true)
    try {
      const page = await fetchAccessLogPage(cursorAfter(entries))
      setEntries((current) => [...current, ...page])
      setHasMore(page.length === PAGE_SIZE)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Errore sconosciuto')
    } finally {
      isFetching.current = false
      setIsLoadingMore(false)
    }
  }, [entries, hasMore])

  useEffect(() => {
    loadFirstPage(false)
  }, [loadFirstPage])

  return {
    entries,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    error,
    refresh: () => loadFirstPage(true),
    loadMore,
  }
}
