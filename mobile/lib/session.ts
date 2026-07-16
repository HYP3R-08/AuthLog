import { supabase } from './supabase'

// The UUID the door checks is the authenticated user's id — the same value the
// tag carries and the gateway verifies. It is never chosen by the client.
export async function getCurrentUuid(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return null
  }
  return data.user.id
}

// Supabase surfaces auth failures as structured errors. They are mapped to
// user-facing text here rather than shown raw: server messages can distinguish
// "wrong password" from "no such account", which tells an attacker which
// addresses are registered.
export function describeAuthError(error: { message: string } | null): string {
  if (!error) {
    return 'Errore sconosciuto'
  }
  const message = error.message.toLowerCase()

  if (message.includes('invalid login credentials')) {
    return 'Credenziali non valide'
  }
  if (message.includes('email not confirmed')) {
    return 'Conferma la tua email prima di accedere'
  }
  if (message.includes('user already registered')) {
    return 'Questa email è già registrata'
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Troppi tentativi. Riprova tra qualche minuto'
  }
  return 'Operazione non riuscita. Riprova'
}
