// AuthLog — access verification endpoint
//
// The gateway asks this function whether a UUID may open the door. The service
// role key lives here, in the function environment, and never reaches the
// device: a microcontroller can be opened with a screwdriver, this cannot.
//
// Request   POST { "uuid": "<36-char uuid>" }
//           X-Device-Token: <shared device secret>
// Response  200 { "authorized": true | false }
//
// Every attempt is logged, authorized or not — a log that only records success
// is useless for spotting someone probing the door.
//
// Deploy:
//   supabase secrets set DEVICE_TOKEN=$(openssl rand -hex 32)
//   supabase functions deploy verify-access
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const DEVICE_TOKEN = Deno.env.get('DEVICE_TOKEN')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Compares in time independent of how many characters match, so that response
// timing cannot be used to recover the token one byte at a time.
function isTokenValid(candidate: string | null): boolean {
  if (!candidate || !DEVICE_TOKEN) return false

  const expected = new TextEncoder().encode(DEVICE_TOKEN)
  const actual = new TextEncoder().encode(candidate)
  if (expected.length !== actual.length) return false

  let difference = 0
  for (let i = 0; i < expected.length; i++) {
    difference |= expected[i] ^ actual[i]
  }
  return difference === 0
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405)
  }
  if (!DEVICE_TOKEN || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('function is missing required environment variables')
    return json({ error: 'server misconfigured' }, 500)
  }
  if (!isTokenValid(request.headers.get('X-Device-Token'))) {
    return json({ error: 'unauthorized' }, 401)
  }

  let uuid: unknown
  try {
    const body = await request.json()
    uuid = body?.uuid
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  // The UUID originates from an NFC tag, which anyone can write. It is checked
  // here as well as on the device: the device check is a convenience, this one
  // is the boundary.
  if (typeof uuid !== 'string' || !UUID_PATTERN.test(uuid)) {
    return json({ error: 'invalid uuid' }, 400)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data, error } = await supabase
    .from('authorized')
    .select('uuid')
    .eq('uuid', uuid)
    .maybeSingle()

  if (error) {
    // Distinguish "not authorized" from "could not check": the caller must not
    // read a lookup failure as a rejection.
    console.error('authorization lookup failed', error)
    return json({ error: 'lookup failed' }, 503)
  }

  const authorized = data !== null

  const { error: logError } = await supabase
    .from('logs')
    .insert({ uuid_auth: authorized ? uuid : null, granted: authorized })

  if (logError) {
    // Logging is best-effort: a failed audit write must not deny a legitimate
    // user. It is recorded for the operator instead.
    console.error('log insert failed', logError)
  }

  return json({ authorized })
})
