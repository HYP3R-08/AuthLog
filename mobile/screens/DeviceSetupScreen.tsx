import React, { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../App'
import { useDeviceSetup } from '../hooks/useDeviceSetup'
import { validateWifi, type WifiState } from '../lib/deviceSetup'
import Screen from '../components/Screen'
import AppText from '../components/AppText'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import TextField from '../components/TextField'
import StatusPill, { type PillTone } from '../components/StatusPill'
import { colors, radius, space } from '../theme/tokens'

type DeviceSetupScreenProps = NativeStackScreenProps<RootStackParamList, 'DeviceSetup'>

const WIFI_PILL: Record<WifiState, { label: string; tone: PillTone }> = {
  connected: { label: 'Wi-Fi collegato', tone: 'granted' },
  connecting: { label: 'Collegamento...', tone: 'warning' },
  failed: { label: 'Collegamento fallito', tone: 'denied' },
  none: { label: 'Nessuna rete', tone: 'neutral' },
}

function Notice({ tone, text }: { tone: 'granted' | 'denied'; text: string }) {
  const color = tone === 'granted' ? colors.granted : colors.denied
  return (
    <View style={[styles.notice, { backgroundColor: tone === 'granted' ? colors.grantedSoft : colors.deniedSoft }]}>
      <Ionicons name={tone === 'granted' ? 'checkmark-circle' : 'alert-circle'} size={18} color={color} />
      <AppText variant="label" color={color} style={styles.noticeText}>
        {text}
      </AppText>
    </View>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

export default function DeviceSetupScreen({ navigation }: DeviceSetupScreenProps) {
  const setup = useDeviceSetup()
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')

  async function handleSaveWifi() {
    const problem = validateWifi(ssid, password)
    if (problem) {
      Alert.alert('Controlla la rete', problem)
      return
    }
    if (await setup.saveWifi(ssid.trim(), password)) {
      setPassword('')
    }
  }

  const isBusy = setup.phase === 'working'
  const isLinked = setup.phase === 'connected' || setup.phase === 'working'

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Indietro" onPress={() => navigation.goBack()} />
        <View style={styles.titleBlock}>
          <AppText variant="overline" color={colors.brand}>
            AMMINISTRAZIONE
          </AppText>
          <AppText variant="title">Dispositivo AuthLog</AppText>
        </View>
      </View>

      {setup.error && <Notice tone="denied" text={setup.error} />}
      {setup.message && <Notice tone="granted" text={setup.message} />}

      {(setup.phase === 'idle' || setup.phase === 'scanning') && (
        <Card>
          <AppText variant="body" color={colors.textMuted}>
            Avvicinati al lettore con il Bluetooth attivo. Sullo schermo del dispositivo compare il suo nome, ad esempio
            "AuthLog-1A2B".
          </AppText>
          <Button
            label={setup.phase === 'scanning' ? 'Ricerca in corso...' : 'Cerca dispositivi'}
            icon="bluetooth"
            onPress={setup.startScan}
            loading={setup.phase === 'scanning'}
          />
          {setup.devices.map((device) => (
            <Pressable
              key={device.id}
              onPress={() => setup.connect(device)}
              style={({ pressed }) => [styles.deviceRow, pressed && styles.deviceRowPressed]}
              accessibilityRole="button"
            >
              <Ionicons name="hardware-chip-outline" size={20} color={colors.brand} />
              <AppText variant="bodyStrong" style={styles.deviceName}>
                {device.name}
              </AppText>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          ))}
        </Card>
      )}

      {setup.phase === 'connecting' && (
        <Card>
          <ActivityIndicator color={colors.brand} />
          <AppText variant="bodyStrong" align="center">
            Collegamento a {setup.selected?.name}
          </AppText>
          <AppText variant="body" color={colors.textMuted} align="center">
            Se il telefono chiede un codice di abbinamento, inserisci quello mostrato sullo schermo del dispositivo.
          </AppText>
        </Card>
      )}

      {isLinked && setup.status && (
        <>
          <Card>
            <View style={styles.deviceHeader}>
              <AppText variant="heading">{setup.selected?.name}</AppText>
              <StatusPill label={WIFI_PILL[setup.status.wifi].label} tone={WIFI_PILL[setup.status.wifi].tone} />
            </View>
            {setup.status.ssid.length > 0 && (
              <AppText variant="body" color={colors.textMuted}>
                Rete attuale: {setup.status.ssid}
              </AppText>
            )}
          </Card>

          {!setup.status.claimed && (
            <Card>
              <AppText variant="bodyStrong">Questo AuthLog non ha ancora un proprietario</AppText>
              <AppText variant="body" color={colors.textMuted}>
                Diventandone proprietario, solo questo telefono potrà cambiare la rete Wi-Fi del dispositivo.
              </AppText>
              <Button label="Diventa proprietario" icon="key-outline" onPress={setup.claim} loading={isBusy} />
            </Card>
          )}

          {setup.status.claimed && setup.isOwner && (
            <Card>
              <AppText variant="bodyStrong">Rete Wi-Fi</AppText>
              <TextField label="Nome della rete" icon="wifi" value={ssid} onChangeText={setSsid} placeholder="Es. Casa-2.4GHz" autoCapitalize="none" autoCorrect={false} />
              <TextField label="Password" icon="lock-closed-outline" isSecret value={password} onChangeText={setPassword} placeholder="Vuota per una rete aperta" autoCapitalize="none" autoCorrect={false} />
              <AppText variant="caption" color={colors.textFaint}>
                Il dispositivo vede solo reti a 2,4 GHz.
              </AppText>
              <Button label="Salva rete" icon="save-outline" onPress={handleSaveWifi} loading={isBusy} />
            </Card>
          )}

          {setup.status.claimed && !setup.isOwner && (
            <Card>
              <AppText variant="bodyStrong" color={colors.warning}>
                Configurato da un altro amministratore
              </AppText>
              <AppText variant="body" color={colors.textMuted}>
                Solo il telefono che ne è proprietario può cambiare la rete. Per reimpostarlo, tieni premuti i tasti A e B
                mentre lo accendi: perderà proprietario e rete, e il primo che si collega ne diventerà proprietario.
              </AppText>
            </Card>
          )}

          <Button label="Disconnetti" icon="close" variant="secondary" onPress={setup.disconnect} disabled={isBusy} />
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, gap: space.lg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.lg, marginBottom: space.sm },
  titleBlock: { gap: 2 },
  card: {
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  noticeText: { flex: 1 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceRowPressed: { backgroundColor: colors.surfacePressed },
  deviceName: { flex: 1 },
  deviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
})
