import React, { useEffect, useState } from 'react'
import { View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter'

import { supabase } from './lib/supabase'
import { colors } from './theme/tokens'
import LoginScreen from './screens/LoginScreen'
import SignupScreen from './screens/SignupScreen'
import HomeScreen from './screens/HomeScreen'
import AccessLogScreen from './screens/AccessLogScreen'
import DeviceSetupScreen from './screens/DeviceSetupScreen'

export type RootStackParamList = {
  Login: undefined
  Signup: undefined
  Home: undefined
  AccessLog: undefined
  DeviceSetup: undefined
}

const Stack = createNativeStackNavigator<RootStackParamList>()

const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.brand,
    text: colors.text,
  },
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  })
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null)

  // A persisted session skips the login screen. Home re-validates it with the
  // server and sends the user back to Login if it is no longer good.
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setInitialRoute(data.session ? 'Home' : 'Login'))
      .catch(() => setInitialRoute('Login'))
  }, [])

  if (!fontsLoaded || !initialRoute) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName={initialRoute}
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="AccessLog" component={AccessLogScreen} />
          <Stack.Screen name="DeviceSetup" component={DeviceSetupScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
