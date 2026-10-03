// Date and name formatting for the access log. Done by hand rather than with
// Intl: Hermes ships a reduced Intl on some Android builds, and a log whose
// timestamps render differently per device is worse than no formatting.

const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const MS_PER_DAY = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function formatDate(date: Date): string {
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}

// "Oggi", "Ieri", or a short Italian date such as "lun 2 ott 2026".
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / MS_PER_DAY)
  if (daysAgo === 0) return 'Oggi'
  if (daysAgo === 1) return 'Ieri'
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fullName(nome: string | null, cognome: string | null): string | null {
  const name = [nome, cognome]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ')
  return name.length > 0 ? name : null
}

export function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')
}

export function shortUuid(uuid: string | null): string {
  return uuid ? `${uuid.slice(0, 8)}...${uuid.slice(-4)}` : 'nessun UUID'
}
