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
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  cargando: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    cargarSesion();
  }, []);

  const cargarSesion = useCallback(async () => {
    try {
      const tokenGuardado = await AsyncStorage.getItem('token');
      const usuarioGuardado = await AsyncStorage.getItem('usuario');
      if (tokenGuardado && usuarioGuardado) {
        let usuarioParsed: Usuario;

        try {
          usuarioParsed = JSON.parse(usuarioGuardado) as Usuario;
        } catch {
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('usuario');
          return;
        }

        if (usuarioParsed.rol !== 'mensajero') {
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('usuario');
          return;
        }

        setToken(tokenGuardado);
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
    const response = await loginApi(username, password);
    const { access, usuario: usuarioLogueado } = response.data;

    if (usuarioLogueado.rol !== 'mensajero') {
      throw new Error('Perfil no autorizado');
    }

    await AsyncStorage.setItem('token', access);
    await AsyncStorage.setItem('usuario', JSON.stringify(usuarioLogueado));
    setToken(access);
    setUsuario(usuarioLogueado);

    const servicioActivo = await getActiveServiceId();
    if (servicioActivo) {
      void startBackgroundTracking(Number(servicioActivo));
    }
  }, []);

  const logout = useCallback(async () => {
    await stopBackgroundTracking();
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('usuario');
    setToken(null);
    setUsuario(null);
  }, []);

  const value = useMemo(() => ({ usuario, token, login, logout, cargando }), [usuario, token, login, logout, cargando]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);