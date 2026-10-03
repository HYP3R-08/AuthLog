import { supabase } from './supabase'
import { dayKey, formatDayLabel, fullName } from './format'

export const PAGE_SIZE = 40

export interface AccessLogEntry {
  id: number
  time: Date
  granted: boolean
  uuid: string | null
  name: string | null
}

export interface AccessLogSection {
  key: string
  title: string
  data: AccessLogEntry[]
}

export interface PageCursor {
  beforeTime: string
  beforeId: number
}

interface AccessLogRow {
  id: number
  log_time: string
  granted: boolean
  uuid_auth: string | null
  nome: string | null
  cognome: string | null
}

function toEntry(row: AccessLogRow): AccessLogEntry {
  return {
    id: row.id,
    time: new Date(row.log_time),
    granted: row.granted,
    uuid: row.uuid_auth,
    name: fullName(row.nome, row.cognome),
  }
}

// Reads one page through admin_access_logs(), which refuses anyone who is not
// in the admins table. The page after `cursor` is everything strictly older.
export async function fetchAccessLogPage(cursor: PageCursor | null): Promise<AccessLogEntry[]> {
  const { data, error } = await supabase.rpc('admin_access_logs', {
    p_limit: PAGE_SIZE,
    p_before_time: cursor?.beforeTime ?? null,
    p_before_id: cursor?.beforeId ?? null,
  })

  if (error) {
    throw new Error(
      error.code === '42501'
        ? 'Questo account non è amministratore'
        : 'Impossibile caricare il registro accessi'
    )
  }
  return ((data ?? []) as AccessLogRow[]).map(toEntry)
}

export function cursorAfter(entries: AccessLogEntry[]): PageCursor | null {
  const last = entries[entries.length - 1]
  return last ? { beforeTime: last.time.toISOString(), beforeId: last.id } : null
}

export function groupByDay(entries: AccessLogEntry[], now: Date = new Date()): AccessLogSection[] {
  return entries.reduce<AccessLogSection[]>((sections, entry) => {
    const key = dayKey(entry.time)
    const current = sections[sections.length - 1]
    if (current && current.key === key) {
      return [...sections.slice(0, -1), { ...current, data: [...current.data, entry] }]
    }
    return [...sections, { key, title: formatDayLabel(entry.time, now), data: [entry] }]
  }, [])
}

export type LogFilter = 'all' | 'granted' | 'denied'

export function applyFilter(entries: AccessLogEntry[], filter: LogFilter): AccessLogEntry[] {
  if (filter === 'all') return entries
  return entries.filter((entry) => entry.granted === (filter === 'granted'))
}
