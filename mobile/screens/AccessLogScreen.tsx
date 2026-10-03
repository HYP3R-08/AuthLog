import React, { useMemo, useState } from 'react'
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../App'
import { applyFilter, groupByDay, type LogFilter } from '../lib/accessLog'
import { useAccessLog } from '../hooks/useAccessLog'
import AppText from '../components/AppText'
import Button from '../components/Button'
import IconButton from '../components/IconButton'
import LogRow from '../components/LogRow'
import SegmentedControl from '../components/SegmentedControl'
import { colors, radius, space } from '../theme/tokens'

type AccessLogScreenProps = NativeStackScreenProps<RootStackParamList, 'AccessLog'>

const FILTERS: { value: LogFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'granted', label: 'Consentiti' },
  { value: 'denied', label: 'Negati' },
]

interface StatProps {
  value: number
  label: string
  color: string
}

function Stat({ value, label, color }: StatProps) {
  return (
    <View style={styles.stat}>
      <AppText variant="title" color={color}>
        {value}
      </AppText>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
    </View>
  )
}

function CenteredMessage({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.message}>
      <Ionicons name={icon} size={32} color={colors.textFaint} />
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText variant="body" color={colors.textMuted} align="center">
        {body}
      </AppText>
    </View>
  )
}

export default function AccessLogScreen({ navigation }: AccessLogScreenProps) {
  const log = useAccessLog()
  const [filter, setFilter] = useState<LogFilter>('all')

  const sections = useMemo(() => groupByDay(applyFilter(log.entries, filter)), [log.entries, filter])
  const grantedCount = log.entries.filter((entry) => entry.granted).length
  const deniedCount = log.entries.length - grantedCount

  const header = (
    <View style={styles.header}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Indietro" onPress={() => navigation.goBack()} />
        <View style={styles.titleBlock}>
          <AppText variant="overline" color={colors.brand}>
            AMMINISTRAZIONE
          </AppText>
          <AppText variant="title">Registro accessi</AppText>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={log.entries.length} label="Tentativi" color={colors.text} />
        <View style={styles.divider} />
        <Stat value={grantedCount} label="Consentiti" color={colors.granted} />
        <View style={styles.divider} />
        <Stat value={deniedCount} label="Negati" color={colors.denied} />
      </View>

      <SegmentedControl segments={FILTERS} value={filter} onChange={setFilter} />
    </View>
  )

  if (log.isLoading) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]}>
        <ActivityIndicator color={colors.brand} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(entry) => String(entry.id)}
        renderItem={({ item }) => <LogRow entry={item} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <AppText variant="overline" color={colors.textMuted}>
              {section.title.toUpperCase()}
            </AppText>
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          log.error ? (
            <View style={styles.errorBlock}>
              <CenteredMessage icon="cloud-offline-outline" title="Registro non disponibile" body={log.error} />
              <Button label="Riprova" icon="refresh" variant="secondary" onPress={log.refresh} />
            </View>
          ) : (
            <CenteredMessage icon="file-tray-outline" title="Nessun accesso" body="Qui compariranno i tentativi registrati dal lettore." />
          )
        }
        ListFooterComponent={log.isLoadingMore ? <ActivityIndicator color={colors.brand} style={styles.footer} /> : null}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        stickySectionHeadersEnabled
        onEndReached={log.loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl refreshing={log.isRefreshing} onRefresh={log.refresh} tintColor={colors.brand} colors={[colors.brand]} progressBackgroundColor={colors.surfaceRaised} />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  header: { gap: space.xl, paddingTop: space.lg, paddingBottom: space.sm },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  titleBlock: { gap: 2 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border },
  sectionHeader: { paddingTop: space.xl, paddingBottom: space.md, backgroundColor: colors.background },
  separator: { height: space.sm },
  message: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl, paddingHorizontal: space.lg },
  errorBlock: { gap: space.lg },
  footer: { paddingVertical: space.xl },
})
