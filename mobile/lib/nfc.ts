import type NfcManagerType from 'react-native-nfc-manager'
import type { Ndef as NdefType, NfcTech as NfcTechType } from 'react-native-nfc-manager'

// The phone writes the user's UUID into the reader's ST25DV as an NDEF URI
// record, "https://<uuid>". The reader strips the scheme and validates the rest.

export type NfcStatus = 'unavailable' | 'disabled' | 'ready'
export type WriteResult = 'written' | 'cancelled' | 'timeout'

interface NfcModule {
  manager: typeof NfcManagerType
  Ndef: typeof NdefType
  NfcTech: typeof NfcTechType
}

// Loaded lazily: the native module only exists in a native build. In Expo Go
// or on the web the import itself can throw, and the app must still open.
let cachedModule: NfcModule | null | undefined

function loadNfc(): NfcModule | null {
  if (cachedModule !== undefined) return cachedModule
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nfc = require('react-native-nfc-manager')
    cachedModule = { manager: nfc.default, Ndef: nfc.Ndef, NfcTech: nfc.NfcTech }
  } catch {
    cachedModule = null
  }
  return cachedModule
}

// start() registers a receiver on the Android activity; once per app run is
// enough, and calling it on every tap only piles up registrations.
let startPromise: Promise<void> | null = null
function ensureStarted(nfc: NfcModule): Promise<void> {
  if (!startPromise) {
    startPromise = nfc.manager.start().catch((error: unknown) => {
      startPromise = null  // allow a retry on the next tap
      throw error
    })
  }
  return startPromise
}

export async function getNfcStatus(): Promise<NfcStatus> {
  const nfc = loadNfc()
  if (!nfc) return 'unavailable'
  try {
    if (!(await nfc.manager.isSupported())) return 'unavailable'
    await ensureStarted(nfc)
    return (await nfc.manager.isEnabled()) ? 'ready' : 'disabled'
  } catch {
    return 'unavailable'
  }
}

export async function openNfcSettings(): Promise<void> {
  const nfc = loadNfc()
  if (nfc) {
    await nfc.manager.goToNfcSetting().catch(() => false)
  }
}

function isCancellation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /cancel/i.test(message)
}

// How long to wait for the phone to reach the reader before giving up, so a
// request nobody follows through never keeps the button in "writing".
const REQUEST_TIMEOUT_MS = 30000

// NFC sessions run one at a time, each starting only after the previous one
// has fully released the adapter. On Android, cancelTechnologyRequest() waits
// a second and then stops tag dispatch: a request started inside that second
// would be left waiting for a tag that never arrives, which is exactly what a
// quick second tap used to do.
let sessionQueue: Promise<unknown> = Promise.resolve()
function inQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = sessionQueue.then(task, task)
  sessionQueue = run.catch(() => undefined)
  return run
}

const TIMED_OUT = Symbol('timed out')

async function writeSession(nfc: NfcModule, uuid: string): Promise<WriteResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), REQUEST_TIMEOUT_MS)
  })

  try {
    await ensureStarted(nfc)
    const request = nfc.manager.requestTechnology(nfc.NfcTech.Ndef)
    // If the timeout wins, this request is cancelled in `finally` and rejects
    // later, with nobody awaiting it: swallow that one rejection.
    request.catch(() => undefined)
    const outcome = await Promise.race([request, timeout])
    if (outcome === TIMED_OUT) {
      return 'timeout'
    }
    const message = nfc.Ndef.encodeMessage([nfc.Ndef.uriRecord(`https://${uuid}`)])
    await nfc.manager.ndefHandler.writeNdefMessage(message)
    return 'written'
  } catch (error) {
    if (isCancellation(error)) return 'cancelled'
    throw new Error('Scrittura non riuscita. Tieni il telefono fermo sul lettore e riprova')
  } finally {
    clearTimeout(timer)
    // Always release the adapter, also after a timeout: the request is still
    // pending natively and would block the next one.
    await nfc.manager.cancelTechnologyRequest().catch(() => undefined)
  }
}

// Waits for the reader, writes the record and always releases the NFC session,
// even on failure: a session left open blocks every later attempt.
export function writeUuidToReader(uuid: string): Promise<WriteResult> {
  const nfc = loadNfc()
  if (!nfc) {
    return Promise.reject(new Error('NFC non disponibile su questo dispositivo'))
  }
  return inQueue(() => writeSession(nfc, uuid))
}

// Interrupts a waiting request. Deliberately outside the queue: it must reach
// the session that is currently waiting, whose own cleanup then runs in order.
export async function cancelWrite(): Promise<void> {
  const nfc = loadNfc()
  if (nfc) {
    await nfc.manager.cancelTechnologyRequest({ delayMsAndroid: 0 }).catch(() => undefined)
  }
}
