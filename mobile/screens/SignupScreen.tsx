import React, { useState } from 'react'
import { Alert, StyleSheet, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../App'
import { supabase } from '../lib/supabase'
import { describeAuthError } from '../lib/session'
import Screen from '../components/Screen'
import TextField from '../components/TextField'
import Button from '../components/Button'
import AppText from '../components/AppText'
import IconButton from '../components/IconButton'
import { colors, space } from '../theme/tokens'

type SignupScreenProps = NativeStackScreenProps<RootStackParamList, 'Signup'>

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface SignupForm {
  nome: string
  cognome: string
  email: string
  password: string
}

function validate(form: SignupForm): string | null {
  if (!form.nome.trim() || !form.cognome.trim() || !form.email.trim() || !form.password) {
    return 'Compila tutti i campi'
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) {
    return 'Inserisci un indirizzo email valido'
  }
  if (form.password.length < MIN_PASSWORD_LENGTH) {
    return `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri`
  }
  return null
}

export default function SignupScreen({ navigation }: SignupScreenProps) {
  const [form, setForm] = useState<SignupForm>({ nome: '', cognome: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const update = (field: keyof SignupForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  async function handleSignup() {
    const validationError = validate(form)
    if (validationError) {
      Alert.alert('Controlla i dati', validationError)
      return
    }

    setLoading(true)
    // Supabase Auth owns the credential. The profile row is created by a
    // database trigger from this metadata, so the client never writes it.
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { nome: form.nome.trim(), cognome: form.cognome.trim() } },
    })
    setLoading(false)

    if (error) {
      Alert.alert('Registrazione non riuscita', describeAuthError(error))
      return
    }

    Alert.alert(
      'Controlla la tua email',
      'Ti abbiamo inviato un link di conferma. Aprilo, poi accedi.',
      [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
    )
  }

  return (
    <Screen scroll contentStyle={styles.content}>
      <View style={styles.topBar}>
        <IconButton icon="chevron-back" label="Indietro" onPress={() => navigation.goBack()} />
      </View>

      <View style={styles.header}>
        <AppText variant="overline" color={colors.brand}>
          NUOVO ACCOUNT
        </AppText>
        <AppText variant="title">Crea il tuo pass</AppText>
        <AppText variant="body" color={colors.textMuted}>
          Dopo la registrazione un amministratore abiliterà il tuo accesso.
        </AppText>
      </View>

      <View style={styles.form}>
        <View style={styles.row}>
          <TextField
            label="Nome"
            icon="person-outline"
            value={form.nome}
            onChangeText={update('nome')}
            placeholder="Mario"
            autoComplete="given-name"
            style={styles.half}
          />
          <TextField
            label="Cognome"
            icon="people-outline"
            value={form.cognome}
            onChangeText={update('cognome')}
            placeholder="Rossi"
            autoComplete="family-name"
            style={styles.half}
          />
        </View>
        <TextField
          label="Email"
          icon="mail-outline"
          value={form.email}
          onChangeText={update('email')}
          placeholder="nome@esempio.it"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextField
          label="Password"
          icon="lock-closed-outline"
          isSecret
          value={form.password}
          onChangeText={update('password')}
          placeholder={`Almeno ${MIN_PASSWORD_LENGTH} caratteri`}
          autoComplete="new-password"
        />
        <Button label="Registrati" icon="checkmark" onPress={handleSignup} loading={loading} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingTop: space.lg, gap: space.xxl },
  topBar: { flexDirection: 'row' },
  header: { gap: space.sm },
  form: { gap: space.lg },
  row: { flexDirection: 'row', gap: space.md },
  half: { flex: 1 },
})
