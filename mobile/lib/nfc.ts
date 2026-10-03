import type NfcManagerType from 'react-native-nfc-manager'
import type { Ndef as NdefType, NfcTech as NfcTechType } from 'react-native-nfc-manager'

// The phone writes the user's UUID into the reader's ST25DV as an NDEF URI
// record, "https://<uuid>". The reader strips the scheme and validates the rest.

export type NfcStatus = 'unavailable' | 'disabled' | 'ready'
export type WriteResult = 'written' | 'cancelled'

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

export async function getNfcStatus(): Promise<NfcStatus> {
  const nfc = loadNfc()
  if (!nfc) return 'unavailable'
  try {
    if (!(await nfc.manager.isSupported())) return 'unavailable'
    await nfc.manager.start()
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

// Waits for the reader, writes the record and always releases the NFC session,
// even on failure: a session left open blocks every later attempt.
export async function writeUuidToReader(uuid: string): Promise<WriteResult> {
  const nfc = loadNfc()
  if (!nfc) {
    throw new Error('NFC non disponibile su questo dispositivo')
  }

  try {
    await nfc.manager.requestTechnology(nfc.NfcTech.Ndef)
    const message = nfc.Ndef.encodeMessage([nfc.Ndef.uriRecord(`https://${uuid}`)])
    await nfc.manager.ndefHandler.writeNdefMessage(message)
    return 'written'
  } catch (error) {
    if (isCancellation(error)) return 'cancelled'
    throw new Error('Scrittura non riuscita. Tieni il telefono fermo sul lettore e riprova')
  } finally {
    await nfc.manager.cancelTechnologyRequest().catch(() => undefined)
  }
}

export async function cancelWrite(): Promise<void> {
  const nfc = loadNfc()
  if (nfc) {
    await nfc.manager.cancelTechnologyRequest().catch(() => undefined)
  }
}
