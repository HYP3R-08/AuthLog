import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../App'
import {
  fetchAdminCandidates,
  fetchAdminMembers,
  grantAdmin,
  matchesQuery,
  type AdminMember,
  type Person,
} from '../lib/adminRoles'
import { initials } from '../lib/format'
import Screen from '../components/Screen'
import AppText from '../components/AppText'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import TextField from '../components/TextField'
import StatusPill from '../components/StatusPill'
import { colors, radius, space } from '../theme/tokens'

type ManageAdminsScreenProps = NativeStackScreenProps<RootStackParamList, 'ManageAdmins'>

interface PersonRowProps {
  person: Person
  trailing: React.ReactNode
  tint: string
}

function PersonRow({ person, trailing, tint }: PersonRowProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: colors.surfaceRaised }]}>
        <AppText variant="bodyStrong" color={tint}>
          {initials(person.name)}
        </AppText>
      </View>
      <View style={styles.rowText}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {person.name}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} numberOfLines={1}>
          {person.email}
        </AppText>
      </View>
      {trailing}
    </View>
  )
}

export default function ManageAdminsScreen({ navigation }: ManageAdminsScreenProps) {
  const [admins, setAdmins] = useState<AdminMember[]>([])
  const [candidates, setCandidates] = useState<Person[]>([])
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promotingId, setPromotingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [members, people] = await Promise.all([fetchAdminMembers(), fetchAdminCandidates()])
      setAdmins(members)
      setCandidates(people)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Errore sconosciuto')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function promote(person: Person) {
    setPromotingId(person.id)
    try {
      await grantAdmin(person.id)
      await load()
    } catch (caught) {
      Alert.alert('Operazione non riuscita', caught instanceof Error ? caught.message : 'Riprova')
    } finally {
      setPromotingId(null)
    }
  }

  function confirmPromote(person: Person) {
    Alert.alert(
      'Rendere amministratore?',
      `${person.name} potrà vedere il registro accessi e configurare il dispositivo. Non potrà nominare altri amministratori.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Rendi amministratore', onPress: () => promote(person) },
      ]
    )
  }

  const visibleCandidates = candidates.filter((person) => matchesQuery(person, query))

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Indietro" onPress={() => navigation.goBack()} />
        <View style={styles.titleBlock}>
          <AppText variant="overline" color={colors.brand}>
            AMMINISTRATORE PRINCIPALE
          </AppText>
          <AppText variant="title">Amministratori</AppText>
        </View>
      </View>

      {isLoading && <ActivityIndicator color={colors.brand} style={styles.loader} />}

      {error && (
        <View style={styles.card}>
          <AppText variant="bodyStrong" color={colors.denied}>
            {error}
          </AppText>
          <Button label="Riprova" icon="refresh" variant="secondary" onPress={load} />
        </View>
      )}

      {!isLoading && !error && (
        <>
          <View style={styles.section}>
            <AppText variant="overline" color={colors.textMuted}>
              AMMINISTRATORI ({admins.length})
            </AppText>
            {admins.map((admin) => (
              <PersonRow
                key={admin.id}
                person={admin}
                tint={colors.brand}
                trailing={admin.isPrimary ? <StatusPill label="Principale" tone="granted" /> : null}
              />
            ))}
          </View>

          <View style={styles.section}>
            <AppText variant="overline" color={colors.textMuted}>
              UTENTI ({candidates.length})
            </AppText>
            <TextField
              label="Cerca"
              icon="search"
              value={query}
              onChangeText={setQuery}
              placeholder="Nome, cognome o email"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {visibleCandidates.length === 0 && (
              <AppText variant="body" color={colors.textMuted} style={styles.empty}>
                {candidates.length === 0 ? 'Tutti gli utenti sono già amministratori.' : 'Nessun utente corrisponde alla ricerca.'}
              </AppText>
            )}
            {visibleCandidates.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                tint={colors.textMuted}
                trailing={
                  <Pressable
                    onPress={() => confirmPromote(person)}
                    disabled={promotingId !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Rendi ${person.name} amministratore`}
                    style={({ pressed }) => [styles.promote, pressed && styles.promotePressed]}
                  >
                    {promotingId === person.id ? (
                      <ActivityIndicator size="small" color={colors.brand} />
                    ) : (
                      <>
                        <Ionicons name="shield-outline" size={14} color={colors.brand} />
                        <AppText variant="label" color={colors.brand}>
                          Rendi admin
                        </AppText>
                      </>
                    )}
                  </Pressable>
                }
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, gap: space.xl },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  titleBlock: { gap: 2, flex: 1 },
  loader: { marginTop: space.xxl },
  card: {
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  section: { gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  promote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 34,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
  },
  promotePressed: { opacity: 0.7 },
  empty: { paddingVertical: space.md },
})
