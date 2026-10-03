import React from 'react'
import { Text, type TextProps, type TextStyle } from 'react-native'
import { colors, type as typeScale, type TypeVariant } from '../theme/tokens'

interface AppTextProps extends TextProps {
  variant?: TypeVariant
  color?: string
  align?: TextStyle['textAlign']
}

export default function AppText({
  variant = 'body',
  color = colors.text,
  align,
  style,
  ...rest
}: AppTextProps) {
  return <Text {...rest} style={[typeScale[variant], { color, textAlign: align }, style]} />
}
