import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AppText from './AppText'
import StatusPill from './StatusPill'
import type { AccessLogEntry } from '../lib/accessLog'
import { formatTime, initials, shortUuid } from '../lib/format'
import { colors, radius, space } from '../theme/tokens'

interface LogRowProps {
  entry: AccessLogEntry
}

// One attempt. An unknown UUID is shown as such rather than hidden: a denied
// attempt from nobody on record is exactly what an administrator looks for.
export default function LogRow({ entry }: LogRowProps) {
  const tint = entry.granted ? colors.granted : colors.denied
  const tintSoft = entry.granted ? colors.grantedSoft : colors.deniedSoft

  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: tintSoft }]}>
        {entry.name ? (
          <AppText variant="bodyStrong" color={tint}>
            {initials(entry.name)}
          </AppText>
        ) : (
          <Ionicons name="help" size={18} color={tint} />
        )}
      </View>

      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1} color={entry.name ? colors.text : colors.textMuted}>
          {entry.name ?? 'Sconosciuto'}
        </AppText>
        <View style={styles.meta}>
          <Ionicons name="time-outline" size={12} color={colors.textFaint} />
          <AppText variant="caption" color={colors.textMuted}>
            {formatTime(entry.time)}
          </AppText>
          {!entry.name && (
            <AppText variant="mono" color={colors.textFaint} numberOfLines={1} style={styles.uuid}>
              {shortUuid(entry.uuid)}
            </AppText>
          )}
        </View>
      </View>

      <StatusPill label={entry.granted ? 'Consentito' : 'Negato'} tone={entry.granted ? 'granted' : 'denied'} />
    </View>
  )
}

const styles = StyleSheet.create({
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
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  uuid: { flexShrink: 1, marginLeft: space.xs },
})
