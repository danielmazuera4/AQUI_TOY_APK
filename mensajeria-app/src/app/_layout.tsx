import { useEffect } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { View, ActivityIndicator, Text, TextInput, Platform, Alert } from 'react-native';
import { MD3LightTheme, PaperProvider } from 'react-native-paper';
import { paperThemeFonts } from '../theme/utils';
import { setRefreshFailedCallback } from '../services/api';

const customTheme = {
  ...MD3LightTheme,
  fonts: {
    ...MD3LightTheme.fonts,
    ...paperThemeFonts,
  },
};

const textDefaults = Text as unknown as { defaultProps?: { style?: any } };
if (textDefaults.defaultProps == null) textDefaults.defaultProps = {};
textDefaults.defaultProps.style = {
  fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
  fontWeight: '400',
  color: '#52525B',
};

const textInputDefaults = TextInput as unknown as { defaultProps?: { style?: any } };
if (textInputDefaults.defaultProps == null) textInputDefaults.defaultProps = {};
textInputDefaults.defaultProps.style = {
  fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
  fontWeight: '400',
};

function RootLayoutNav() {
  const { usuario, cargando, logout } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    setRefreshFailedCallback(() => {
      void logout();
      Alert.alert('Sesión expirada', 'Tu sesión ha expirado, por favor inicia sesión nuevamente');
    });
  }, [logout]);

  useEffect(() => {
    if (cargando) return;

    const currentPath = pathname ?? '/';

    if (usuario?.rol === 'mensajero') {
      if (!currentPath.startsWith('/(mensajero)') && currentPath !== '/profile') {
        router.replace('/(mensajero)/inicio');
      }
      return;
    }

    if (usuario) {
      void logout();
    }

    if (currentPath !== '/') {
      router.replace('/');
    }
  }, [usuario, cargando, logout, pathname]);

  if (cargando) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(mensajero)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <PaperProvider theme={customTheme}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </PaperProvider>
  );
}