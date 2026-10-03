import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { colors, gradients } from '../theme/tokens'

export type BeaconState = 'idle' | 'writing' | 'success' | 'error'

const SIZE = 132
const RING_COUNT = 2
const PULSE_MS = 1800

const ICONS: Record<BeaconState, keyof typeof Ionicons.glyphMap> = {
  idle: 'radio-outline',
  writing: 'radio',
  success: 'checkmark',
  error: 'close',
}

const RING_COLORS: Record<BeaconState, string> = {
  idle: colors.brand,
  writing: colors.brand,
  success: colors.granted,
  error: colors.denied,
}

interface NfcBeaconProps {
  state: BeaconState
}

// The NFC key: rings ripple outward while the phone is waiting for the reader,
// so "searching" reads as motion rather than as a line of text. Only transform
// and opacity animate, on the native driver.
export default function NfcBeacon({ state }: NfcBeaconProps) {
  const pulses = useRef(Array.from({ length: RING_COUNT }, () => new Animated.Value(0))).current

  useEffect(() => {
    if (state !== 'writing') {
      pulses.forEach((pulse) => pulse.setValue(0))
      return
    }
    const loops = pulses.map((pulse, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((PULSE_MS / RING_COUNT) * index),
          Animated.timing(pulse, {
            toValue: 1,
            duration: PULSE_MS,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      )
    )
    loops.forEach((loop) => loop.start())
    return () => loops.forEach((loop) => loop.stop())
  }, [state, pulses])

  const ringColor = RING_COLORS[state]
  const isResult = state === 'success' || state === 'error'

  return (
    <View style={styles.root}>
      {pulses.map((pulse, index) => (
        <Animated.View
          key={index}
          style={[
            styles.ring,
            {
              borderColor: ringColor,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
            },
          ]}
        />
      ))}
      <View style={[styles.halo, { borderColor: ringColor }]} />
      {isResult ? (
        <View style={[styles.core, { backgroundColor: ringColor }]}>
          <Ionicons name={ICONS[state]} size={48} color={colors.background} />
        </View>
      ) : (
        <LinearGradient colors={gradients.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.core}>
          <Ionicons name={ICONS[state]} size={48} color="#FFFFFF" />
        </LinearGradient>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: SIZE * 2, height: SIZE * 1.6, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 2 },
  halo: {
    position: 'absolute',
    width: SIZE + 28,
    height: SIZE + 28,
    borderRadius: (SIZE + 28) / 2,
    borderWidth: 1,
    opacity: 0.25,
  },
  core: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
