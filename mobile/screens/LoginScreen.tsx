import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../App'
import { supabase } from '../lib/supabase'
import { describeAuthError } from '../lib/session'
import Screen from '../components/Screen'
import BrandMark from '../components/BrandMark'
import TextField from '../components/TextField'
import Button from '../components/Button'
import AppText from '../components/AppText'
import { colors, space } from '../theme/tokens'

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>

export default function LoginScreen({ navigation }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Campi mancanti', 'Inserisci email e password')
      return
    }

    setLoading(true)
    // The password goes to Supabase Auth, which checks it against a bcrypt hash
    // server-side. It is never stored, queried or compared by this app.
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setLoading(false)

    if (error || !data.user) {
      Alert.alert('Accesso non riuscito', describeAuthError(error))
      return
    }

    navigation.reset({ index: 0, routes: [{ name: 'Home' }] })
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <BrandMark tagline="Il tuo telefono è la chiave." />

      <View style={styles.form}>
        <TextField
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          placeholder="nome@esempio.it"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <TextField
          label="Password"
          icon="lock-closed-outline"
          isSecret
          value={password}
          onChangeText={setPassword}
          placeholder="La tua password"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleLogin}
        />
        <Button label="Accedi" icon="arrow-forward" onPress={handleLogin} loading={loading} />
      </View>

      <Pressable
        onPress={() => navigation.navigate('Signup')}
        style={({ pressed }) => [styles.footer, pressed && styles.footerPressed]}
        accessibilityRole="link"
      >
        <AppText variant="body" color={colors.textMuted} align="center">
          Non hai un account?{' '}
          <AppText variant="bodyStrong" color={colors.brand}>
            Registrati
          </AppText>
        </AppText>
      </Pressable>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', paddingTop: space.xxxl, gap: space.xxxl },
  form: { gap: space.lg },
  footer: { paddingVertical: space.md },
  footerPressed: { opacity: 0.6 },
})
