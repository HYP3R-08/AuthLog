import { supabase } from './supabase'
import { fullName } from './format'

// Administrator management, for the primary administrator only. The checks
// live in the database (supabase/migrations/0003_primary_admin.sql): these
// functions refuse any other caller, so hiding the screen is convenience, not
// the security boundary.

export interface Person {
  id: string
  name: string
  email: string
}

export interface AdminMember extends Person {
  isPrimary: boolean
}

interface PersonRow {
  id: string
  nome: string | null
  cognome: string | null
  email: string | null
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: fullName(row.nome, row.cognome) ?? 'Senza nome',
    email: row.email ?? '',
  }
}

function describeError(code: string | undefined, fallback: string): string {
  switch (code) {
    case '42501':
      return 'Solo l\'amministratore principale può farlo'
    case '23505':
      return 'Questo utente è già amministratore'
    case 'P0002':
      return 'Utente non trovato'
    default:
      return fallback
  }
}

export async function fetchAdminCandidates(): Promise<Person[]> {
  const { data, error } = await supabase.rpc('admin_candidates')
  if (error) {
    throw new Error(describeError(error.code, 'Impossibile caricare gli utenti'))
  }
  return ((data ?? []) as PersonRow[]).map(toPerson)
}

export async function fetchAdminMembers(): Promise<AdminMember[]> {
  const { data, error } = await supabase.rpc('admin_members')
  if (error) {
    throw new Error(describeError(error.code, 'Impossibile caricare gli amministratori'))
  }
  return ((data ?? []) as (PersonRow & { is_primary: boolean })[]).map((row) => ({
    ...toPerson(row),
    isPrimary: row.is_primary === true,
  }))
}

export async function grantAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc('grant_admin', { p_user: userId })
  if (error) {
    throw new Error(describeError(error.code, 'Promozione non riuscita'))
  }
}

export function matchesQuery(person: Person, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return true
  return person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle)
}
