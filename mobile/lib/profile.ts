import { supabase } from './supabase'

export interface Profile {
  id: string
  email: string
  nome: string
  cognome: string
  isAdmin: boolean
  isPrimaryAdmin: boolean  // the first administrator: the only one who can promote others
}

interface AdminRole {
  isAdmin: boolean
  isPrimaryAdmin: boolean
}

// Reads the signed-in user's own admins row (RLS lets each user see only
// theirs). A database without migration 0003 has no is_primary column: then
// the user is still recognised as an administrator, just not as the primary.
async function fetchAdminRole(userId: string): Promise<AdminRole> {
  const withPrimary = await supabase.from('admins').select('uuid, is_primary').eq('uuid', userId).maybeSingle()
  if (!withPrimary.error) {
    return {
      isAdmin: withPrimary.data !== null,
      isPrimaryAdmin: withPrimary.data?.is_primary === true,
    }
  }

  const plain = await supabase.from('admins').select('uuid').eq('uuid', userId).maybeSingle()
  // A missing admins table (migration 0002 not applied) reads as "not admin"
  // rather than breaking the home screen.
  return { isAdmin: !plain.error && plain.data !== null, isPrimaryAdmin: false }
}

// Everything the home screen needs about the signed-in user, read through RLS:
// the profile and admin rows are only visible to their owner.
export async function fetchCurrentProfile(): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return null
  }
  const user = userData.user

  const [profileResult, role] = await Promise.all([
    supabase.from('profiles').select('nome, cognome').eq('id', user.id).maybeSingle(),
    fetchAdminRole(user.id),
  ])

  if (profileResult.error) {
    throw new Error('Impossibile caricare il profilo')
  }

  return {
    id: user.id,
    email: user.email ?? '',
    nome: profileResult.data?.nome ?? '',
    cognome: profileResult.data?.cognome ?? '',
    ...role,
  }
}
