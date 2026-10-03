import React from 'react'
import { StyleSheet, View } from 'react-native'
import AppText from './AppText'
import { colors, radius, space } from '../theme/tokens'

export type PillTone = 'granted' | 'denied' | 'warning' | 'neutral'

const TONES: Record<PillTone, { fg: string; bg: string }> = {
  granted: { fg: colors.granted, bg: colors.grantedSoft },
  denied: { fg: colors.denied, bg: colors.deniedSoft },
  warning: { fg: colors.warning, bg: colors.warningSoft },
  neutral: { fg: colors.textMuted, bg: colors.surfaceRaised },
}

interface StatusPillProps {
  label: string
  tone: PillTone
}

export default function StatusPill({ label, tone }: StatusPillProps) {
  const { fg, bg } = TONES[tone]
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <AppText variant="label" color={fg}>
        {label}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
})
