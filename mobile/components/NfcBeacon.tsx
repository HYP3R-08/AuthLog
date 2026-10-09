import React, { useEffect, useRef } from 'react'
import { Animated, Easing, StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { colors, gradients } from '../theme/tokens'

export type BeaconState = 'idle' | 'writing' | 'success' | 'error' | 'timeout'

const SIZE = 132
const RING_COUNT = 2
const PULSE_MS = 1800

const ICONS: Record<BeaconState, keyof typeof Ionicons.glyphMap> = {
  idle: 'radio-outline',
  writing: 'radio',
  success: 'checkmark',
  error: 'close',
  timeout: 'time-outline',
}

const RING_COLORS: Record<BeaconState, string> = {
  idle: colors.brand,
  writing: colors.brand,
  success: colors.granted,
  error: colors.denied,
  timeout: colors.warning,
}

const RESULT_STATES: BeaconState[] = ['success', 'error', 'timeout']

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
  const isResult = state === 'success' || state === 'error' || state === 'timeout'

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
      {/*
        Every fill is its own fixed layer, always mounted, with a colour that
        never changes; a state only picks which one is opaque. On Android (New
        Architecture) both remounting the gradient (it rendered blank) and
        switching a view's background from transparent to a colour (it lost
        its rounded corners and showed as a square) misdraw.
      */}
      <View style={styles.core}>
        <LinearGradient
          pointerEvents="none"
          colors={gradients.brand}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.coreLayer, { opacity: isResult ? 0 : 1 }]}
        />
        {RESULT_STATES.map((resultState) => (
          <View
            key={resultState}
            pointerEvents="none"
            style={[
              styles.coreLayer,
              { backgroundColor: RING_COLORS[resultState], opacity: state === resultState ? 1 : 0 },
            ]}
          />
        ))}
        <Ionicons name={ICONS[state]} size={48} color={isResult ? colors.background : '#FFFFFF'} />
      </View>
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
  coreLayer: { ...StyleSheet.absoluteFillObject, borderRadius: SIZE / 2 },
})
