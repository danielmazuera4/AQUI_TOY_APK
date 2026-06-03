import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginApi } from '../services/api';
import { startBackgroundTracking, stopBackgroundTracking, getActiveServiceId } from '../services/background-location';

interface Usuario {
  id: number;
  username: string;
  rol: string;
  empresa: { id: number; nombre: string } | null;
}

interface AuthContextType {
  usuario: Usuario | null;
  token: string | null;
  refreshToken: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  cargando: boolean;
  updateTokens: (access: string, refresh: string) => void;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarSesion();
  }, []);

  const cargarSesion = useCallback(async () => {
    try {
      const tokenGuardado = await AsyncStorage.getItem('token');
      const refreshTokenGuardado = await AsyncStorage.getItem('refreshToken');
      const usuarioGuardado = await AsyncStorage.getItem('usuario');
      if (tokenGuardado && refreshTokenGuardado && usuarioGuardado) {
        let usuarioParsed: Usuario;

        try {
          usuarioParsed = JSON.parse(usuarioGuardado) as Usuario;
        } catch {
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('refreshToken');
          await AsyncStorage.removeItem('usuario');
          return;
        }

        if (usuarioParsed.rol !== 'mensajero') {
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('refreshToken');
          await AsyncStorage.removeItem('usuario');
          return;
        }

        setToken(tokenGuardado);
        setRefreshToken(refreshTokenGuardado);
        setUsuario(usuarioParsed);

        const servicioActivo = await getActiveServiceId();
        if (servicioActivo && usuarioParsed.rol === 'mensajero') {
          void startBackgroundTracking(Number(servicioActivo));
        }
      }
    } catch {
      // Si falla la carga, arrancamos sin sesión.
    } finally {
      setCargando(false);
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    // Clear previous state before setting new user
    setToken(null);
    setRefreshToken(null);
    setUsuario(null);

    const response = await loginApi(username, password);
    const { access, refresh, usuario: usuarioLogueado } = response.data;

    if (usuarioLogueado.rol !== 'mensajero') {
      throw new Error('Perfil no autorizado');
    }

    console.log('Login exitoso para usuario:', usuarioLogueado.username || usuarioLogueado.first_name);

    await AsyncStorage.setItem('token', access);
    await AsyncStorage.setItem('refreshToken', refresh);
    await AsyncStorage.setItem('usuario', JSON.stringify(usuarioLogueado));
    setToken(access);
    setRefreshToken(refresh);
    setUsuario(usuarioLogueado);

    const servicioActivo = await getActiveServiceId();
    if (servicioActivo) {
      void startBackgroundTracking(Number(servicioActivo));
    }
  }, []);

  const logout = useCallback(async () => {
    await stopBackgroundTracking();
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('refreshToken');
    await AsyncStorage.removeItem('usuario');
    setToken(null);
    setRefreshToken(null);
    setUsuario(null);
  }, []);

  const updateTokens = useCallback((access: string, refresh: string) => {
    setToken(access);
    setRefreshToken(refresh);
    AsyncStorage.setItem('token', access);
    AsyncStorage.setItem('refreshToken', refresh);
  }, []);

  const value = useMemo(() => ({ usuario, token, refreshToken, login, logout, cargando, updateTokens }), [usuario, token, refreshToken, login, logout, cargando, updateTokens]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);