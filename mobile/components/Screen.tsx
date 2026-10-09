import React from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { colors, gradients, space } from '../theme/tokens'

// Room left between the focused field and the top of the keyboard, so the
// user sees the whole field, its label and a little context below it.
const KEYBOARD_GAP = 32

interface ScreenProps {
  children: React.ReactNode
  scroll?: boolean
  contentStyle?: ViewStyle
}

// The shared backdrop: a soft brand glow at the top fading into the base colour,
// so every screen sits in the same space instead of on a flat fill.
//
// Scrolling screens follow the focused field. The app draws edge-to-edge on
// Android, where the window no longer shrinks for the keyboard, so
// KeyboardAvoidingView alone leaves fields hidden under it; the keyboard
// controller tracks the keyboard frame and scrolls the field into view.
export default function Screen({ children, scroll = false, contentStyle }: ScreenProps) {
  const body = scroll ? (
    <KeyboardAwareScrollView
      bottomOffset={KEYBOARD_GAP}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </KeyboardAwareScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  )

  return (
    <View style={styles.root}>
      <LinearGradient colors={gradients.glow} style={styles.glow} pointerEvents="none" />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        {body}
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
