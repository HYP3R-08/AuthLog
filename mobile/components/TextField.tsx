import React, { useState } from 'react'
import { Pressable, StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AppText from './AppText'
import { colors, fonts, radius, space } from '../theme/tokens'

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string
  icon: keyof typeof Ionicons.glyphMap
  isSecret?: boolean
  style?: ViewStyle
}

export default function TextField({ label, icon, isSecret = false, style, ...inputProps }: TextFieldProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [isRevealed, setIsRevealed] = useState(false)

  return (
    <View style={[styles.wrapper, style]}>
      <AppText variant="label" color={colors.textMuted} style={styles.label}>
        {label}
      </AppText>
      <View style={[styles.field, isFocused && styles.fieldFocused]}>
        <Ionicons name={icon} size={18} color={isFocused ? colors.brand : colors.textFaint} />
        <TextInput
          {...inputProps}
          secureTextEntry={isSecret && !isRevealed}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.brand}
          style={styles.input}
          onFocus={(event) => {
            setIsFocused(true)
            inputProps.onFocus?.(event)
          }}
          onBlur={(event) => {
            setIsFocused(false)
            inputProps.onBlur?.(event)
          }}
        />
        {isSecret && (
          <Pressable
            onPress={() => setIsRevealed((value) => !value)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isRevealed ? 'Nascondi password' : 'Mostra password'}
          >
            <Ionicons
              name={isRevealed ? 'eye-off-outline' : 'eye-outline'}
              size={18}
              color={colors.textFaint}
            />
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { gap: space.sm },
  label: { marginLeft: space.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 54,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldFocused: { borderColor: colors.brand, backgroundColor: colors.surfaceRaised },
  input: {
    flex: 1,
    paddingVertical: space.md,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
})
