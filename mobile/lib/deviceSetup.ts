import { PermissionsAndroid, Platform } from 'react-native'
import { BleManager, State, type Device, type Subscription } from 'react-native-ble-plx'
import * as SecureStore from 'expo-secure-store'
import * as Crypto from 'expo-crypto'
import { base64ToText, textToBase64, utf8ByteLength } from './base64'

// Talks to the K10 gateway's Bluetooth setup service
// (firmware/k10-gateway-v2/setup_mode.h). The UUIDs must match provisioning.h.
const SERVICE_UUID = '5f1c7a10-6a2e-4c1b-9e43-0b6a1d7e0001'
const COMMAND_CHAR_UUID = '5f1c7a10-6a2e-4c1b-9e43-0b6a1d7e0002'
const STATUS_CHAR_UUID = '5f1c7a10-6a2e-4c1b-9e43-0b6a1d7e0003'

const DEVICE_NAME_PREFIX = 'AuthLog-'
const REQUESTED_MTU = 247
const COMMAND_TIMEOUT_MS = 15000
const OWNER_KEY_BYTES = 32

export const MAX_SSID_LENGTH = 32
export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 63

export type WifiState = 'none' | 'connecting' | 'connected' | 'failed'

export interface DeviceStatus {
  claimed: boolean
  wifi: WifiState
  ssid: string
  result: string
}

export interface FoundDevice {
  id: string
  name: string
}

// One manager for the whole app: the native module allows a single instance.
let manager: BleManager | null = null
function ble(): BleManager {
  if (!manager) {
    manager = new BleManager()
  }
  return manager
}

// The owner key never leaves the phone except over the encrypted link to its
// own device. It is kept per device, in the OS keystore, not in AsyncStorage.
function ownerKeyStorageName(deviceName: string): string {
  return `authlog_owner_${deviceName.replace(/[^A-Za-z0-9._-]/g, '_')}`
}

export async function getOwnerKey(deviceName: string): Promise<string | null> {
  return SecureStore.getItemAsync(ownerKeyStorageName(deviceName))
}

async function createOwnerKey(deviceName: string): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(OWNER_KEY_BYTES)
  const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  await SecureStore.setItemAsync(ownerKeyStorageName(deviceName), key)
  return key
}

async function forgetOwnerKey(deviceName: string): Promise<void> {
  await SecureStore.deleteItemAsync(ownerKeyStorageName(deviceName))
}

// Android 12+ asks for scan/connect at runtime; older versions tie BLE
// scanning to location. iOS asks on first use, from Info.plist.
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true
  const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : 0
  const wanted =
    apiLevel >= 31
      ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
  const results = await PermissionsAndroid.requestMultiple(wanted)
  return wanted.every((permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED)
}

export async function isBluetoothOn(): Promise<boolean> {
  return (await ble().state()) === State.PoweredOn
}

// Reports each AuthLog device once. Returns a function that stops the scan.
export function scanForDevices(onFound: (device: FoundDevice) => void, onError: (message: string) => void): () => void {
  const seen = new Set<string>()
  ble().startDeviceScan([SERVICE_UUID], null, (error, device) => {
    if (error) {
      onError('Ricerca Bluetooth non riuscita')
      return
    }
    const name = device?.localName ?? device?.name ?? ''
    if (device && name.startsWith(DEVICE_NAME_PREFIX) && !seen.has(device.id)) {
      seen.add(device.id)
      onFound({ id: device.id, name })
    }
  })
  return () => {
    ble().stopDeviceScan()
  }
}

function parseStatus(base64Value: string | null | undefined): DeviceStatus {
  const raw = JSON.parse(base64ToText(base64Value ?? '')) as Partial<DeviceStatus>
  return {
    claimed: raw.claimed === true,
    wifi: (['none', 'connecting', 'connected', 'failed'] as const).includes(raw.wifi as WifiState)
      ? (raw.wifi as WifiState)
      : 'none',
    ssid: typeof raw.ssid === 'string' ? raw.ssid : '',
    result: typeof raw.result === 'string' ? raw.result : '',
  }
}

// Connecting does not pair yet. The first read of the status touches an
// encrypted characteristic, which makes the phone ask for the code on screen.
export async function connectToDevice(id: string): Promise<DeviceStatus> {
  const device: Device = await ble().connectToDevice(id, { requestMTU: REQUESTED_MTU })
  await device.discoverAllServicesAndCharacteristics()
  const characteristic = await ble().readCharacteristicForDevice(id, SERVICE_UUID, STATUS_CHAR_UUID)
  return parseStatus(characteristic.value)
}

export async function disconnectFromDevice(id: string): Promise<void> {
  await ble()
    .cancelDeviceConnection(id)
    .catch(() => undefined)
}

// Live status updates, e.g. Wi-Fi going from "connecting" to "connected".
export function watchStatus(id: string, onStatus: (status: DeviceStatus) => void): Subscription {
  return ble().monitorCharacteristicForDevice(id, SERVICE_UUID, STATUS_CHAR_UUID, (error, characteristic) => {
    if (!error && characteristic?.value) {
      try {
        onStatus(parseStatus(characteristic.value))
      } catch {
        // a malformed notification is ignored; the next one replaces it
      }
    }
  })
}

// The replies each command can produce. Anything else on the status
// characteristic (e.g. "wifi_changed", or a stale reply to an older command)
// is not an answer to the command just sent.
const REPLIES: Record<string, Set<string>> = {
  claim: new Set(['claimed', 'already_claimed', 'invalid_key', 'malformed']),
  wifi: new Set(['wifi_saved', 'not_owner', 'invalid_wifi', 'malformed']),
}

// Writes a command and resolves with the status the device publishes in reply.
// The reply normally arrives as a notification; if the subscription was not
// live in time to catch it, the status is read back once as a fallback (the
// device sets the value before notifying, so the read sees the same reply).
async function sendCommand(id: string, command: Record<string, string>): Promise<DeviceStatus> {
  const expected = REPLIES[command.op] ?? new Set<string>()
  return new Promise<DeviceStatus>((resolve, reject) => {
    let isSettled = false
    let subscription: Subscription | null = null

    const settle = (outcome: () => void) => {
      if (isSettled) return
      isSettled = true
      clearTimeout(timer)
      clearTimeout(fallback)
      subscription?.remove()
      outcome()
    }

    const timer = setTimeout(() => settle(() => reject(new Error('Il dispositivo non ha risposto'))), COMMAND_TIMEOUT_MS)
    let fallback: ReturnType<typeof setTimeout> | undefined

    subscription = watchStatus(id, (status) => {
      if (expected.has(status.result)) {
        settle(() => resolve(status))
      }
    })

    ble()
      .writeCharacteristicWithResponseForDevice(id, SERVICE_UUID, COMMAND_CHAR_UUID, textToBase64(JSON.stringify(command)))
      .then(() => {
        fallback = setTimeout(async () => {
          try {
            const characteristic = await ble().readCharacteristicForDevice(id, SERVICE_UUID, STATUS_CHAR_UUID)
            const status = parseStatus(characteristic.value)
            if (expected.has(status.result)) settle(() => resolve(status))
          } catch {
            // keep waiting for the notification until the timeout
          }
        }, 1500)
      })
      .catch(() => settle(() => reject(new Error('Invio al dispositivo non riuscito'))))
  })
}

// First power-on only: the device accepts a claim while it has no owner.
// The key is stored before sending, and dropped again if the device refuses.
export async function claimDevice(id: string, deviceName: string): Promise<DeviceStatus> {
  const key = await createOwnerKey(deviceName)
  try {
    const status = await sendCommand(id, { op: 'claim', key })
    if (status.result !== 'claimed') {
      await forgetOwnerKey(deviceName)
    }
    return status
  } catch (error) {
    await forgetOwnerKey(deviceName)
    throw error
  }
}

export async function setDeviceWifi(
  id: string,
  deviceName: string,
  ssid: string,
  password: string
): Promise<DeviceStatus> {
  const key = await getOwnerKey(deviceName)
  if (!key) {
    throw new Error('Questo telefono non è il proprietario del dispositivo')
  }
  return sendCommand(id, { op: 'wifi', key, ssid, pass: password })
}

export function validateWifi(ssid: string, password: string): string | null {
  if (ssid.trim().length === 0) return 'Inserisci il nome della rete'
  if (utf8ByteLength(ssid) > MAX_SSID_LENGTH) return 'Il nome della rete è troppo lungo'
  const passwordBytes = utf8ByteLength(password)
  if (passwordBytes > 0 && passwordBytes < MIN_PASSWORD_LENGTH) {
    return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri (o lasciala vuota per una rete aperta)`
  }
  if (passwordBytes > MAX_PASSWORD_LENGTH) return 'La password è troppo lunga'
  return null
}

const RESULT_MESSAGES: Record<string, string> = {
  claimed: 'Ora sei il proprietario di questo AuthLog',
  wifi_saved: 'Rete salvata: il dispositivo si sta collegando',
  already_claimed: 'Questo AuthLog ha già un proprietario',
  not_owner: 'Solo il proprietario può cambiare la rete',
  invalid_wifi: 'Nome o password della rete non validi',
  invalid_key: 'Chiave non valida',
  malformed: 'Comando non valido',
}

export function describeResult(result: string): string {
  return RESULT_MESSAGES[result] ?? 'Operazione non riuscita'
}
