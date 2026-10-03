import { supabase } from './supabase'

export interface Profile {
  id: string
  email: string
  nome: string
  cognome: string
  isAdmin: boolean
}

// Everything the home screen needs about the signed-in user, read through RLS:
// the profile and admin rows are only visible to their owner.
export async function fetchCurrentProfile(): Promise<Profile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) {
    return null
  }
  const user = userData.user

  const [profileResult, adminResult] = await Promise.all([
    supabase.from('profiles').select('nome, cognome').eq('id', user.id).maybeSingle(),
    supabase.from('admins').select('uuid').eq('uuid', user.id).maybeSingle(),
  ])

  if (profileResult.error) {
    throw new Error('Impossibile caricare il profilo')
  }

  return {
    id: user.id,
    email: user.email ?? '',
    nome: profileResult.data?.nome ?? '',
    cognome: profileResult.data?.cognome ?? '',
    // A missing admins table (migration not applied yet) reads as "not admin"
    // rather than breaking the home screen.
    isAdmin: !adminResult.error && adminResult.data !== null,
  }
}
