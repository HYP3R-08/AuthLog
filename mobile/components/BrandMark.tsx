import React from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import AppText from './AppText'
import { colors, gradients, radius, space } from '../theme/tokens'

interface BrandMarkProps {
  tagline?: string
}

export default function BrandMark({ tagline }: BrandMarkProps) {
  return (
    <View style={styles.root}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.badge}
      >
        <Ionicons name="finger-print" size={30} color="#FFFFFF" />
      </LinearGradient>
      <View style={styles.words}>
        <AppText variant="hero">
          Auth<AppText variant="hero" color={colors.brand}>Log</AppText>
        </AppText>
        {tagline && (
          <AppText variant="body" color={colors.textMuted}>
            {tagline}
          </AppText>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: space.xl },
  badge: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: { gap: space.xs },
})
