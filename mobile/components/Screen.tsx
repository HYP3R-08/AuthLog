import React from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, gradients, space } from '../theme/tokens'

interface ScreenProps {
  children: React.ReactNode
  scroll?: boolean
  contentStyle?: ViewStyle
}

// The shared backdrop: a soft brand glow at the top fading into the base colour,
// so every screen sits in the same space instead of on a flat fill.
export default function Screen({ children, scroll = false, contentStyle }: ScreenProps) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  )

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.glow} style={styles.glow} pointerEvents="none" />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 360 },
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space.xl, paddingBottom: space.xl },
})
