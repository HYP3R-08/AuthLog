// Design tokens. Every colour, size and font in the app comes from here, so a
// change of direction is a change to this file rather than a hunt through
// screens.
//
// Direction: a dark security console. Near-black blue surfaces layered by
// lightness, one brand accent for actions, and green/red reserved for the two
// verdicts so that colour always means "granted" or "denied", never decoration.

export const colors = {
  background: '#080B11',
  surface: '#10151E',
  surfaceRaised: '#161D29',
  surfacePressed: '#1C2533',
  border: '#232D3D',
  borderStrong: '#33405A',

  text: '#EEF2F8',
  textMuted: '#93A0B4',
  textFaint: '#5D6A7F',

  brand: '#7B8CFF',
  brandDeep: '#5463F0',
  brandSoft: 'rgba(123, 140, 255, 0.14)',

  granted: '#3DDC97',
  grantedSoft: 'rgba(61, 220, 151, 0.13)',
  denied: '#FF5D6C',
  deniedSoft: 'rgba(255, 93, 108, 0.13)',
  warning: '#FFB547',
  warningSoft: 'rgba(255, 181, 71, 0.13)',
} as const

export const gradients = {
  brand: ['#8A99FF', '#5463F0'] as const,
  glow: ['rgba(84, 99, 240, 0.28)', 'rgba(8, 11, 17, 0)'] as const,
}

export const fonts = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
} as const

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  heading: { fontFamily: fonts.displayMedium, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.bodySemibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.2 },
  mono: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
} as const

export type TypeVariant = keyof typeof type
