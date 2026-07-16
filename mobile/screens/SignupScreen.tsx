import React, { useState } from 'react';
import { View, StyleSheet, Alert, TextInput, Text, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';
import { describeAuthError } from '../lib/session';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type SignupScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

interface SignupScreenProps {
  navigation: SignupScreenNavigationProp;
}

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupScreen({ navigation }: SignupScreenProps) {
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  function validate(): string | null {
    if (!nome || !cognome || !email || !password) {
      return 'Inserisci tutti i campi';
    }
    if (!EMAIL_PATTERN.test(email)) {
      return 'Inserisci un indirizzo email valido';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `La password deve essere di almeno ${MIN_PASSWORD_LENGTH} caratteri`;
    }
    return null;
  }

  async function handleSignup() {
    const validationError = validate();
    if (validationError) {
      Alert.alert('Errore', validationError);
      return;
    }

    setLoading(true);

    // Supabase Auth owns the credential: it hashes the password, enforces
    // uniqueness, and rate-limits attempts. The profile row is created by a
    // database trigger from this metadata, so the client never writes a row it
    // could forge — and no password column exists to leak.
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { nome: nome.trim(), cognome: cognome.trim() },
      },
    });

    setLoading(false);

    if (error) {
      Alert.alert('Errore registrazione', describeAuthError(error));
      return;
    }

    // With email confirmation enabled there is no session yet, so the user is
    // sent to the login screen rather than straight in.
    Alert.alert(
      'Successo',
      'Registrazione completata. Controlla la tua email per confermare l\'account, poi accedi.',
      [{ text: 'OK', onPress: () => navigation.navigate('Login') }]
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Nome</Text>
      <TextInput
        style={styles.input}
        value={nome}
        onChangeText={setNome}
        placeholder="Inserisci nome"
      />

      <Text style={styles.label}>Cognome</Text>
      <TextInput
        style={styles.input}
        value={cognome}
        onChangeText={setCognome}
        placeholder="Inserisci cognome"
      />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Inserisci email"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        secureTextEntry
        autoComplete="new-password"
        onChangeText={setPassword}
        placeholder={`Almeno ${MIN_PASSWORD_LENGTH} caratteri`}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSignup}
        disabled={loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Registrazione...' : 'Registrati'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.linkText}>Hai già un account? Accedi</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 40,
    padding: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 5,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
  },
});
