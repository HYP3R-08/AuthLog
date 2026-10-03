import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import AppText from './AppText'
import { colors, radius, space } from '../theme/tokens'

interface Segment<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
}

export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((segment) => {
        const isActive = segment.value === value
        return (
          <Pressable
            key={segment.value}
            onPress={() => onChange(segment.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={[styles.segment, isActive && styles.active]}
          >
            <AppText variant="label" color={isActive ? colors.text : colors.textMuted}>
              {segment.label}
            </AppText>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    padding: space.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm + 2,
    borderRadius: radius.sm,
  },
  active: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
})
