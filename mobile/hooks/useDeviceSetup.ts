import { useCallback, useEffect, useRef, useState } from 'react'
import type { Subscription } from 'react-native-ble-plx'
import {
  claimDevice,
  connectToDevice,
  describeResult,
  disconnectFromDevice,
  getOwnerKey,
  isBluetoothOn,
  requestBluetoothPermissions,
  scanForDevices,
  setDeviceWifi,
  watchStatus,
  type DeviceStatus,
  type FoundDevice,
} from '../lib/deviceSetup'

const SCAN_DURATION_MS = 10000

export type SetupPhase =
  | 'idle'        // nothing started
  | 'scanning'
  | 'connecting'  // includes pairing with the code shown on the K10
  | 'connected'
  | 'working'     // a command is in flight

export interface DeviceSetupState {
  phase: SetupPhase
  devices: FoundDevice[]
  selected: FoundDevice | null
  status: DeviceStatus | null
  isOwner: boolean
  message: string | null
  error: string | null
  startScan: () => void
  connect: (device: FoundDevice) => void
  claim: () => void
  saveWifi: (ssid: string, password: string) => Promise<boolean>
  disconnect: () => void
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function useDeviceSetup(): DeviceSetupState {
  const [phase, setPhase] = useState<SetupPhase>('idle')
  const [devices, setDevices] = useState<FoundDevice[]>([])
  const [selected, setSelected] = useState<FoundDevice | null>(null)
  const [status, setStatus] = useState<DeviceStatus | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const stopScan = useRef<(() => void) | null>(null)
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusWatch = useRef<Subscription | null>(null)
  const connectedId = useRef<string | null>(null)

  const endScan = useCallback(() => {
    if (scanTimer.current) clearTimeout(scanTimer.current)
    stopScan.current?.()
    stopScan.current = null
  }, [])

  const disconnect = useCallback(() => {
    statusWatch.current?.remove()
    statusWatch.current = null
    if (connectedId.current) disconnectFromDevice(connectedId.current)
    connectedId.current = null
    setSelected(null)
    setStatus(null)
    setIsOwner(false)
    setMessage(null)
    setPhase('idle')
  }, [])

  // Leaving the screen must not leave the radio scanning or connected.
  useEffect(() => () => {
    endScan()
    statusWatch.current?.remove()
    if (connectedId.current) disconnectFromDevice(connectedId.current)
  }, [endScan])

  const startScan = useCallback(async () => {
    setError(null)
    setMessage(null)
    if (!(await requestBluetoothPermissions())) {
      setError('Serve il permesso Bluetooth per trovare il dispositivo')
      return
    }
    if (!(await isBluetoothOn())) {
      setError('Attiva il Bluetooth e riprova')
      return
    }
    setDevices([])
    setPhase('scanning')
    stopScan.current = scanForDevices(
      (device) => setDevices((current) => [...current, device]),
      (message) => {
        setError(message)
        endScan()
        setPhase('idle')
      }
    )
    scanTimer.current = setTimeout(() => {
      endScan()
      setPhase((current) => (current === 'scanning' ? 'idle' : current))
    }, SCAN_DURATION_MS)
  }, [endScan])

  const connect = useCallback(
    async (device: FoundDevice) => {
      endScan()
      setError(null)
      setSelected(device)
      setPhase('connecting')
      try {
        const initial = await connectToDevice(device.id)
        connectedId.current = device.id
        setStatus(initial)
        setIsOwner((await getOwnerKey(device.name)) !== null)
        statusWatch.current = watchStatus(device.id, setStatus)
        setPhase('connected')
      } catch (caught) {
        setError(errorText(caught, 'Connessione non riuscita. Controlla il codice mostrato sul dispositivo e riprova'))
        disconnectFromDevice(device.id)
        setSelected(null)
        setPhase('idle')
      }
    },
    [endScan]
  )

  const claim = useCallback(async () => {
    if (!selected) return
    setError(null)
    setPhase('working')
    try {
      const result = await claimDevice(selected.id, selected.name)
      setStatus(result)
      setIsOwner(result.result === 'claimed')
      if (result.result === 'claimed') setMessage(describeResult(result.result))
      else setError(describeResult(result.result))
    } catch (caught) {
      setError(errorText(caught, 'Operazione non riuscita'))
    } finally {
      setPhase('connected')
    }
  }, [selected])

  const saveWifi = useCallback(
    async (ssid: string, password: string): Promise<boolean> => {
      if (!selected) return false
      setError(null)
      setMessage(null)
      setPhase('working')
      try {
        const result = await setDeviceWifi(selected.id, selected.name, ssid, password)
        setStatus(result)
        const isSaved = result.result === 'wifi_saved'
        if (isSaved) setMessage(describeResult(result.result))
        else setError(describeResult(result.result))
        return isSaved
      } catch (caught) {
        setError(errorText(caught, 'Operazione non riuscita'))
        return false
      } finally {
        setPhase('connected')
      }
    },
    [selected]
  )

  return { phase, devices, selected, status, isOwner, message, error, startScan, connect, claim, saveWifi, disconnect }
}
