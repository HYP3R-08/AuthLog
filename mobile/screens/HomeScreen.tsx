import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

// Import condizionale di react-native-nfc-manager
let NfcManager: any = null;
let NfcTech: any = null;
let Ndef: any = null;

try {
  const nfcModule = require('react-native-nfc-manager');
  console.log('Modulo NFC caricato:', !!nfcModule);
  
  // Gestisce sia default export che named export
  if (nfcModule && typeof nfcModule === 'object') {
    // Prova diversi modi per ottenere NfcManager
    if (nfcModule.default && typeof nfcModule.default === 'object') {
      NfcManager = nfcModule.default;
    } else if (nfcModule.NfcManager) {
      NfcManager = nfcModule.NfcManager;
    } else {
      NfcManager = nfcModule;
    }
    
    // Prova a ottenere NfcTech e Ndef
    if (nfcModule.NfcTech) {
      NfcTech = nfcModule.NfcTech;
    } else if (nfcModule.default?.NfcTech) {
      NfcTech = nfcModule.default.NfcTech;
    } else if (NfcManager?.NfcTech) {
      NfcTech = NfcManager.NfcTech;
    }
    
    if (nfcModule.Ndef) {
      Ndef = nfcModule.Ndef;
    } else if (nfcModule.default?.Ndef) {
      Ndef = nfcModule.default.Ndef;
    } else if (NfcManager?.Ndef) {
      Ndef = NfcManager.Ndef;
    }
    
    console.log('NfcManager disponibile:', !!NfcManager);
    console.log('NfcTech disponibile:', !!NfcTech);
    console.log('Ndef disponibile:', !!Ndef);
    
    // Verifica che abbia i metodi necessari
    if (!NfcManager || typeof NfcManager.isSupported !== 'function') {
      console.warn('react-native-nfc-manager non ha i metodi necessari');
      NfcManager = null;
    }
  }
} catch (e) {
  console.warn('react-native-nfc-manager non installato:', e);
  NfcManager = null;
  NfcTech = null;
  Ndef = null;
}

type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ route, navigation }: HomeScreenProps) {
  const userEmail = route.params?.email;
  const userUuid = route.params?.uuid;
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcEnabled, setNfcEnabled] = useState(false);
  const [isWriting, setIsWriting] = useState(false);

  useEffect(() => {
    if (NfcManager) {
      checkNfcSupport();
      return () => {
        // Cleanup: ferma la sessione NFC quando il componente viene smontato
        if (nfcEnabled) {
          NfcManager.cancelTechnologyRequest().catch(() => {});
        }
      };
    } else {
      setNfcSupported(false);
    }
  }, []);

  async function checkNfcSupport() {
    if (!NfcManager) {
      console.log('NfcManager non disponibile');
      setNfcSupported(false);
      return;
    }

    // Verifica che NfcManager abbia i metodi necessari
    if (typeof NfcManager.isSupported !== 'function') {
      console.error('NfcManager.isSupported non è una funzione');
      setNfcSupported(false);
      return;
    }

    try {
      // Prova prima a controllare se è supportato senza inizializzare
      let supported = false;
      let enabled = false;

      try {
        supported = await NfcManager.isSupported();
        console.log('NFC supportato:', supported);
      } catch (e) {
        console.error('Errore nel controllo isSupported:', e);
        setNfcSupported(false);
        return;
      }

      setNfcSupported(supported);

      if (supported) {
        // Controlla se è abilitato
        try {
          if (typeof NfcManager.isEnabled === 'function') {
            enabled = await NfcManager.isEnabled();
            console.log('NFC abilitato:', enabled);
            setNfcEnabled(enabled);
          } else {
            console.warn('NfcManager.isEnabled non è una funzione');
            setNfcEnabled(true);
          }
        } catch (e) {
          console.error('Errore nel controllo isEnabled:', e);
          setNfcEnabled(true);
        }

        try {
          if (typeof NfcManager.start === 'function') {
            await NfcManager.start();
            console.log('NFC inizializzato con successo');
          }
        } catch (startError) {
          console.warn('Errore nell\'inizializzazione NFC (non critico):', startError);
        }
      } else {
        setNfcEnabled(false);
      }
    } catch (error: any) {
      console.error('Errore controllo NFC:', error);
      console.error('Stack trace:', error.stack);
      setNfcSupported(false);
      setNfcEnabled(false);
    }
  }

  useEffect(() => {
    if (NfcManager && nfcSupported && typeof NfcManager.addEventListener === 'function') {
      try {
        // Listener per quando NFC viene abilitato/disabilitato
        const subscription = NfcManager.addEventListener('StateChanged', (state: any) => {
          if (state && typeof state === 'object') {
            if (state.state === 'on') {
              setNfcEnabled(true);
            } else if (state.state === 'off') {
              setNfcEnabled(false);
            }
          }
        });

        return () => {
          if (subscription && typeof subscription === 'object' && typeof subscription.remove === 'function') {
            try {
              subscription.remove();
            } catch (e) {
              console.warn('Errore nella rimozione del listener NFC:', e);
            }
          }
        };
      } catch (e) {
        console.warn('Errore nell\'aggiunta del listener NFC:', e);
      }
    }
  }, [nfcSupported]);

  async function openNfcSettings() {
    try {
      if (Platform.OS === 'android') {
        // Apri le impostazioni NFC su Android
        const nfcSettings = 'android.settings.NFC_SETTINGS';
        const canOpen = await Linking.canOpenURL(nfcSettings);
        if (canOpen) {
          await Linking.openURL(nfcSettings);
        } else {
          // Fallback: apri le impostazioni generali
          await Linking.openSettings();
        }
      } else if (Platform.OS === 'ios') {
        // Su iOS apri le impostazioni dell'app
        await Linking.openURL('app-settings:');
      }
    } catch (error) {
      // Fallback: apri le impostazioni generali
      try {
        await Linking.openSettings();
      } catch (e) {
        Alert.alert(
          'Impossibile aprire le impostazioni',
          'Vai manualmente nelle Impostazioni > Connessioni > NFC e attiva NFC'
        );
      }
    }
  }

  async function handleWriteNfc() {

    // Prova a ricontrollare il supporto prima di scrivere
    if (!nfcSupported) {
      console.log('Rieseguendo controllo NFC...');
      await checkNfcSupport();
      if (!nfcSupported) {
        Alert.alert(
          'NFC non supportato',
          'Il dispositivo potrebbe non supportare NFC.\n\n' +
          'Assicurati di:\n' +
          '1. Aver concesso i permessi NFC all\'app'
        );
        return;
      }
    }

    if (!nfcEnabled) {
      try {
        if (typeof NfcManager.isEnabled === 'function') {
          const currentlyEnabled = await NfcManager.isEnabled();
          if (currentlyEnabled) {
            setNfcEnabled(true);
            // Continua con la scrittura
          } else {
            // Mostra alert ma permette di provare comunque
            Alert.alert(
              'NFC potrebbe non essere attivo',
              'Il sistema indica che NFC potrebbe non essere attivo. Vuoi:\n\n' +
              '1. Provare comunque (consigliato se NFC è attivo)\n' +
              '2. Aprire le impostazioni',
              [
                {
                  text: 'Prova comunque',
                  onPress: () => {
                    // Continua con la scrittura
                    proceedWithWrite();
                  },
                },
                {
                  text: 'Apri Impostazioni',
                  onPress: openNfcSettings,
                },
                {
                  text: 'Annulla',
                  style: 'cancel',
                },
              ]
            );
            return;
          }
        }
      } catch (e) {
        console.warn('Errore nel controllo isEnabled, procediamo comunque:', e);
        // Continua comunque
      }
    }

    proceedWithWrite();
  }

  async function proceedWithWrite() {
    if (!userUuid) {
      Alert.alert('Errore', 'UUID utente non disponibile');
      return;
    }

    if (!NfcManager) {
      Alert.alert('Errore', 'Libreria NFC non disponibile');
      return;
    }

    // Log per debug
    console.log('Inizio scrittura NFC, UUID:', userUuid);
    console.log('NfcManager disponibile:', !!NfcManager);
    console.log('Metodi disponibili:', {
      start: typeof NfcManager.start,
      requestTechnology: typeof NfcManager.requestTechnology,
      Ndef: !!NfcManager.Ndef,
      NfcTech: !!NfcManager.NfcTech,
      util: !!NfcManager.util,
      ndefHandler: !!NfcManager.ndefHandler,
    });

    setIsWriting(true);

    try {
      // Verifica che requestTechnology esista
      if (typeof NfcManager.requestTechnology !== 'function') {
        throw new Error('NfcManager.requestTechnology non è disponibile');
      }

      let localNfcTech = NfcTech;
      let localNdef = Ndef;

      if (!localNfcTech && NfcManager.NfcTech) {
        localNfcTech = NfcManager.NfcTech;
      }
      if (!localNdef && NfcManager.Ndef) {
        localNdef = NfcManager.Ndef;
      }

      // Determina quale tecnologia usare
      let techToUse: any = null;
      
      if (localNfcTech && localNfcTech.Ndef) {
        techToUse = localNfcTech.Ndef;
        console.log('Uso NfcTech.Ndef');
      } else if (localNdef) {
        techToUse = localNdef;
        console.log('Uso Ndef direttamente');
      } else if (NfcManager.Ndef) {
        techToUse = NfcManager.Ndef;
        console.log('Uso NfcManager.Ndef');
      } else {
        throw new Error('Nessuna tecnologia NFC NDEF disponibile');
      }

      console.log('Richiedo tecnologia:', techToUse);
      await NfcManager.requestTechnology(techToUse);
      console.log('Tecnologia NFC richiesta con successo');

      // Prepara il messaggio NDEF con l'UUID
      let ndefMessage: any;

      // Prepara il messaggio NDEF con l'UUID
      console.log('Preparazione messaggio NDEF, Ndef disponibile:', !!localNdef);
      
      if (localNdef && typeof localNdef.encodeMessage === 'function' && typeof localNdef.uriRecord === 'function') {
        try {
          console.log('Creo messaggio URI NFC');
      
          const url = `https://${userUuid}`;
          
          ndefMessage = localNdef.encodeMessage([
            localNdef.uriRecord(url),
          ]);
      
          console.log('Messaggio URI NDEF creato con successo');
        } catch (e) {
          console.warn('Errore creazione URI NDEF:', e);
          ndefMessage = null;
        }
      }
      

      if (!ndefMessage) {
        if (!NfcManager.util || typeof NfcManager.util.stringToBytes !== 'function') {
          throw new Error('NfcManager.util.stringToBytes non è disponibile');
        }

        const bytes = NfcManager.util.stringToBytes(userUuid);
        
        if (typeof NfcManager.NdefMessage === 'function' && typeof NfcManager.NdefRecord === 'function') {
          ndefMessage = NfcManager.NdefMessage([
            NfcManager.NdefRecord({
              tnf: Ndef.TNF_WELL_KNOWN || 1,
              type: Ndef.RTD_TEXT || [0x54],
              payload: bytes,
            }),
          ]);
        } else {
          throw new Error('NdefMessage o NdefRecord non sono disponibili');
        }
      }

      // Verifica che ndefHandler esista
      if (!NfcManager.ndefHandler || typeof NfcManager.ndefHandler.writeNdefMessage !== 'function') {
        throw new Error('NfcManager.ndefHandler.writeNdefMessage non è disponibile');
      }

      // Scrive il messaggio sul tag
      await NfcManager.ndefHandler.writeNdefMessage(ndefMessage);

      // Aggiorna lo stato come abilitato se la scrittura ha successo
      setNfcEnabled(true);
      Alert.alert('Successo', 'UUID scritto sul tag RFID con successo!');
    } catch (error: any) {
      // Log dell'errore completo per debug
      console.error('Errore durante scrittura NFC:', error);
      console.error('Stack trace:', error?.stack);
      console.error('Error message:', error?.message);
      console.error('Error toString:', error?.toString());

      // Gestisci diversi tipi di errori
      const errorMessage = error?.message || error?.toString() || 'Errore sconosciuto';
      const errorStr = String(errorMessage).toLowerCase();

      if (errorStr.includes('user canceled') || errorStr.includes('cancelled') || errorStr.includes('cancel')) {
        // L'utente ha annullato l'operazione
        console.log('Utente ha annullato l\'operazione NFC');
        return;
      }

      // Se l'errore indica che NFC non è abilitato
      if (errorStr.includes('nfc') && (errorStr.includes('disabled') || errorStr.includes('not enabled') || errorStr.includes('not available'))) {
        Alert.alert(
          'NFC non attivo',
          'NFC non risulta attivo sul dispositivo. Assicurati di:\n\n' +
          '1. Aver attivato NFC nelle impostazioni\n' +
          '2. Aver concesso i permessi NFC all\'app\n\n' +
          'Vuoi aprire le impostazioni?',
          [
            {
              text: 'Annulla',
              style: 'cancel',
            },
            {
              text: 'Apri Impostazioni',
              onPress: openNfcSettings,
            },
          ]
        );
      } else {
        // Mostra un messaggio di errore generico ma informativo
        Alert.alert(
          'Errore durante la scrittura',
          `Si è verificato un errore: ${errorMessage}\n\n` +
          'Possibili cause:\n' +
          '1. NFC non è attivo\n' +
          '2. Il tag non è supportato o non è scrivibile\n' +
          '3. Il tag non è abbastanza vicino al dispositivo\n' +
          '4. Permessi NFC non concessi',
          [
            {
              text: 'OK',
            },
            {
              text: 'Apri Impostazioni',
              onPress: openNfcSettings,
            },
          ]
        );
      }
    } finally {
      // Ferma la sessione NFC
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch (e) {

      }
      setIsWriting(false);
    }
  }

  async function handleLogout() {
    // Ferma la sessione NFC se attiva
    if (nfcEnabled && NfcManager) {
      try {
        await NfcManager.cancelTechnologyRequest();
      } catch (e) {

      }
    }

    // Navigating away is not logging out: the session is persisted to
    // AsyncStorage and would survive, leaving the account signed in on a device
    // the user believes they left.
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('Logout non riuscito:', error.message);
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'Login' }],
    });
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Benvenuto!</Text>
      <Text style={styles.email}>{userEmail}</Text>
      

      {!NfcManager && (
        <Text style={styles.warningText}>
          Libreria NFC non installata
        </Text>
      )}

      {NfcManager && !nfcSupported && (
        <View style={styles.debugContainer}>
          <Text style={styles.warningText}>
            NFC non rilevato. Prova a:
          </Text>
          <Text style={styles.debugText}>
            1. Verifica che NFC sia attivo nelle impostazioni{'\n'}
            2. Assicurati di aver eseguito: npx expo prebuild{'\n'}
            3. Ricostruisci l'app con build nativo
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={checkNfcSupport}
          >
            <Text style={styles.retryButtonText}>Riprova Controllo NFC</Text>
          </TouchableOpacity>
        </View>
      )}

      {nfcSupported && !nfcEnabled && (
        <Text style={styles.warningText}>
          NFC potrebbe non essere attivo.
        </Text>
      )}

      {nfcSupported && nfcEnabled && (
        <Text style={styles.successText}>
          ✓ NFC rilevato e pronto
        </Text>
      )}

      <TouchableOpacity
        style={[styles.nfcButton, isWriting && styles.buttonDisabled]}
        onPress={() => {
          try {
            handleWriteNfc();
          } catch (error: any) {
            console.error('Errore critico in handleWriteNfc:', error);
            Alert.alert(
              'Errore Critico',
              `L'app ha riscontrato un errore: ${error?.message || error?.toString() || 'Errore sconosciuto'}\n\n` +
              'Controlla i log per maggiori dettagli.'
            );
          }
        }}
        disabled={isWriting}
      >
        <Text style={styles.nfcButtonText}>
          {isWriting ? 'Scrittura in corso...' : 'Scrivi UUID su Tag RFID'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  email: {
    fontSize: 18,
    color: 'gray',
    marginBottom: 15,
  },
  uuidContainer: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
    maxWidth: 400,
  },
  uuidLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
  },
  uuidText: {
    fontSize: 12,
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  warningText: {
    fontSize: 14,
    color: '#FF9500',
    marginBottom: 15,
    textAlign: 'center',
  },
  successText: {
    fontSize: 14,
    color: '#34C759',
    marginBottom: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
  debugContainer: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    width: '100%',
    maxWidth: 400,
  },
  debugText: {
    fontSize: 12,
    color: '#856404',
    marginTop: 10,
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: '#FF9500',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  nfcButton: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  nfcButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#FF3B30',
    padding: 15,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
