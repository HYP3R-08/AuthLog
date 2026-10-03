import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../App'
import { supabase } from '../lib/supabase'
import { fetchCurrentProfile, type Profile } from '../lib/profile'
import { cancelWrite, getNfcStatus, openNfcSettings, writeUuidToReader, type NfcStatus } from '../lib/nfc'
import { fullName, initials, shortUuid } from '../lib/format'
import Screen from '../components/Screen'
import AppText from '../components/AppText'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import StatusPill, { type PillTone } from '../components/StatusPill'
import NfcBeacon, { type BeaconState } from '../components/NfcBeacon'
import { colors, radius, space } from '../theme/tokens'

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>

const RESULT_DISPLAY_MS = 2500

const NFC_PILL: Record<NfcStatus, { label: string; tone: PillTone }> = {
  ready: { label: 'NFC attivo', tone: 'granted' },
  disabled: { label: 'NFC spento', tone: 'warning' },
  unavailable: { label: 'NFC non disponibile', tone: 'neutral' },
}

const BEACON_COPY: Record<BeaconState, { title: string; hint: string }> = {
  idle: { title: 'Pronto', hint: 'Premi il pulsante, poi avvicina il telefono al lettore.' },
  writing: { title: 'Avvicina il telefono', hint: 'Appoggialo sul lettore e tienilo fermo.' },
  success: { title: 'Pass inviato', hint: 'Mettiti davanti al sensore: la porta ti riconosce.' },
  error: { title: 'Non riuscito', hint: 'Riprova tenendo il telefono fermo sul lettore.' },
}

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [nfcStatus, setNfcStatus] = useState<NfcStatus>('unavailable')
  const [beacon, setBeacon] = useState<BeaconState>('idle')
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goToLogin = useCallback(
    () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }),
    [navigation]
  )

  useEffect(() => {
    fetchCurrentProfile()
      .then((loaded) => (loaded ? setProfile(loaded) : goToLogin()))
      .catch(() => Alert.alert('Errore', 'Impossibile caricare il profilo'))
    getNfcStatus().then(setNfcStatus)
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current)
      cancelWrite()
    }
  }, [goToLogin])

  function showResult(result: BeaconState) {
    setBeacon(result)
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setBeacon('idle'), RESULT_DISPLAY_MS)
  }

  async function handleWrite() {
    if (!profile) return
    if (beacon === 'writing') {
      await cancelWrite()
      setBeacon('idle')
      return
    }

    const status = await getNfcStatus()
    setNfcStatus(status)
    if (status === 'disabled') {
      Alert.alert('NFC spento', 'Attiva NFC per usare il telefono come chiave.', [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Apri impostazioni', onPress: openNfcSettings },
      ])
      return
    }
    if (status === 'unavailable') {
      Alert.alert('NFC non disponibile', 'Questo dispositivo non supporta NFC.')
      return
    }

    setBeacon('writing')
    try {
      const result = await writeUuidToReader(profile.id)
      if (result === 'cancelled') {
        setBeacon('idle')
        return
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      showResult('success')
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      showResult('error')
      Alert.alert('Scrittura non riuscita', error instanceof Error ? error.message : 'Riprova')
    }
  }

  async function handleLogout() {
    await cancelWrite()
    // Leaving the screen is not logging out: the session is persisted and would
    // survive, leaving the account signed in on a device the user thinks they left.
    const { error } = await supabase.auth.signOut()
    if (error) {
      Alert.alert('Errore', 'Logout non riuscito, riprova')
      return
    }
    goToLogin()
  }

  if (!profile) {
    return (
      <Screen contentStyle={styles.loading}>
        <ActivityIndicator color={colors.brand} />
      </Screen>
    )
  }

  const name = fullName(profile.nome, profile.cognome)
  const pill = NFC_PILL[nfcStatus]
  const copy = BEACON_COPY[beacon]

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <AppText variant="bodyStrong" color={colors.brand}>
              {initials(name)}
            </AppText>
          </View>
          <View style={styles.identityText}>
            <AppText variant="caption" color={colors.textMuted}>
              Ciao,
            </AppText>
            <AppText variant="heading" numberOfLines={1}>
              {profile.nome || profile.email}
            </AppText>
          </View>
        </View>
        <IconButton icon="log-out-outline" label="Esci" onPress={handleLogout} />
      </View>

      <View style={styles.passCard}>
        <View style={styles.passHeader}>
          <AppText variant="overline" color={colors.textMuted}>
            IL TUO PASS
          </AppText>
          <StatusPill label={pill.label} tone={pill.tone} />
        </View>

        <View style={styles.beacon}>
          <NfcBeacon state={beacon} />
        </View>

        <View style={styles.copy}>
          <AppText variant="title" align="center">
            {copy.title}
          </AppText>
          <AppText variant="body" color={colors.textMuted} align="center">
            {copy.hint}
          </AppText>
        </View>

        <Button
          label={beacon === 'writing' ? 'Annulla' : 'Usa il pass'}
          icon={beacon === 'writing' ? 'close' : 'radio-outline'}
          variant={beacon === 'writing' ? 'secondary' : 'primary'}
          onPress={handleWrite}
        />

        <AppText variant="mono" color={colors.textFaint} align="center">
          ID {shortUuid(profile.id)}
        </AppText>
      </View>

      {profile.isAdmin && (
        <Pressable
          onPress={() => navigation.navigate('AccessLog')}
          style={({ pressed }) => [styles.adminCard, pressed && styles.adminCardPressed]}
          accessibilityRole="button"
        >
          <View style={styles.adminIcon}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.brand} />
          </View>
          <View style={styles.adminText}>
            <AppText variant="bodyStrong">Registro accessi</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              Chi è entrato, chi è stato respinto e quando
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </Pressable>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingTop: space.lg, gap: space.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  identityText: { flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  passCard: {
    padding: space.xl,
    gap: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  beacon: { alignItems: 'center' },
  copy: { gap: space.sm, marginBottom: space.sm },
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  adminCardPressed: { backgroundColor: colors.surfacePressed },
  adminIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  adminText: { flex: 1, gap: 2 },
})
