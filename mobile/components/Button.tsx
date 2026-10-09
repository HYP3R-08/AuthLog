import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import AppText from './AppText'
import { colors, gradients, radius, space } from '../theme/tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  icon?: keyof typeof Ionicons.glyphMap
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
}

const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  secondary: colors.text,
  ghost: colors.brand,
  danger: colors.denied,
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const isInactive = disabled || loading
  const tint = LABEL_COLOR[variant]

  const content = (
    <View style={styles.row}>
      {loading ? (
        <ActivityIndicator color={tint} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={tint} />}
          <AppText variant="bodyStrong" color={tint}>
            {label}
          </AppText>
        </>
      )}
    </View>
  )

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        pressed && styles.pressed,
        isInactive && styles.inactive,
        style,
      ]}
    >
      {/*
        The gradient stays mounted for every variant and is only faded in or
        out. Unmounting and remounting it inside a rounded, clipped parent left
        it drawn blank on Android (New Architecture) after the first state
        change: the button kept working but became invisible. It carries its
        own radius, so the parent no longer needs overflow clipping.
      */}
      <LinearGradient
        pointerEvents="none"
        colors={gradients.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientLayer, { opacity: variant === 'primary' ? 1 : 0 }]}
      />
      <View style={styles.body}>{content}</View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md },
  gradientLayer: { ...StyleSheet.absoluteFillObject, borderRadius: radius.md },
  body: {
    minHeight: 54,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { backgroundColor: colors.deniedSoft },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  inactive: { opacity: 0.5 },
})
