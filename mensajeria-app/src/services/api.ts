import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

const BASE_URLS = [
  'http://10.201.197.251:8000/api/',
  process.env.EXPO_PUBLIC_API_URL,
  'http://10.248.167.251:8000/api/',
  'http://10.0.2.2:8000/api/',
  'http://127.0.0.1:8000/api/',
  'http://localhost:8000/api/',
].filter(Boolean) as string[];

const clients = BASE_URLS.map((baseURL) => axios.create({ baseURL, timeout: 7000 }));

let activeClientIndex = 0;

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: any) => void; reject: (reason?: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

let onRefreshFailed: (() => void) | null = null;
let onRefreshStarted: (() => void) | null = null;
let onRefreshCompleted: (() => void) | null = null;

export const setRefreshFailedCallback = (callback: () => void) => {
  onRefreshFailed = callback;
};

export const setRefreshStartedCallback = (callback: () => void) => {
  onRefreshStarted = callback;
};

export const setRefreshCompletedCallback = (callback: () => void) => {
  onRefreshCompleted = callback;
};

export const getIsRefreshing = () => isRefreshing;

for (const client of clients) {
  client.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config;

      if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return client(originalRequest);
          }).catch((err) => {
            return Promise.reject(err);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        if (onRefreshStarted) {
          onRefreshStarted();
        }

        try {
          const refreshToken = await AsyncStorage.getItem('refreshToken');
          if (!refreshToken) {
            throw new Error('No refresh token available');
          }

          const response = await requestWithFallback((c) => c.post('usuarios/token/refresh/', { refresh: refreshToken }));
          const { access, refresh: newRefresh } = response.data;

          await AsyncStorage.setItem('token', access);
          await AsyncStorage.setItem('refreshToken', newRefresh);

          originalRequest.headers.Authorization = `Bearer ${access}`;
          processQueue(null, access);

          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('refreshToken');
          await AsyncStorage.removeItem('usuario');
          
          if (onRefreshFailed) {
            onRefreshFailed();
          }
          
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
          if (onRefreshCompleted) {
            onRefreshCompleted();
          }
        }
      }

      return Promise.reject(error);
    }
  );
}

async function requestWithFallback<T>(executor: (client: (typeof clients)[number]) => Promise<T>): Promise<T> {
  let lastError: any;

  for (let offset = 0; offset < clients.length; offset += 1) {
    const index = (activeClientIndex + offset) % clients.length;
    const client = clients[index];

    try {
      const result = await executor(client);
      activeClientIndex = index;
      return result;
    } catch (error: any) {
      lastError = error;
      const status = error?.response?.status;
      if (status && status < 500) {
        throw error;
      }
    }
  }

  throw lastError;
}

function normalizarRespuestaLista(responseData: any) {
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.results)) return responseData.results;
  return [];
}

// Auth
export const loginApi = (username: string, password: string) =>
  requestWithFallback((client) => client.post('usuarios/login/', { username, password }));

export const refreshTokenApi = (refresh: string) =>
  requestWithFallback((client) => client.post('usuarios/token/refresh/', { refresh }));

export const getPerfilApi = () =>
  requestWithFallback((client) => client.get('usuarios/perfil/'));

// Servicios
export const getServiciosApi = async (estado?: string, page = 1, pageSize = 15) => {
  try {
    const response = await requestWithFallback((client) =>
      client.get('servicios/', {
        params: {
          estado,
          page,
          page_size: pageSize,
        },
      }),
    );

    return {
      ...response,
      data: {
        ...response.data,
        results: normalizarRespuestaLista(response.data),
      },
    };
  } catch (error: any) {
    throw error;
  }
};

export const getServicioDetalleApi = (id: number) =>
  requestWithFallback((client) => client.get(`servicios/${id}/`));

export const actualizarUbicacionApi = (id: number, latitud: number, longitud: number) =>
  requestWithFallback((client) => client.post(`servicios/${id}/ubicacion/`, { latitud, longitud }));

export const aceptarServicioApi = (id: number) =>
  requestWithFallback((client) => client.post(`servicios/${id}/aceptar/`));

export const completarPasoApi = (id: number, paso: number, data: FormData) =>
  requestWithFallback((client) => {
    return client.patch(`servicios/${id}/paso/${paso}/`, data, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  });

export const reportarNovedadApi = (id: number, descripcion: string) =>
  requestWithFallback((client) => client.post(`servicios/${id}/novedad/`, { descripcion }));

export const abandonarServicioApi = (id: number, motivo: string) =>
  requestWithFallback((client) => client.post(`servicios/${id}/abandonar/`, { motivo }));

export const cerrarServicioApi = (id: number, fechaISO: string) =>
  requestWithFallback(async (client) => {
    const payload = {
      id,
      estado: 'terminado',
      fecha_finalizacion: fechaISO,
      fecha_cierre: fechaISO,
      fecha_fin: fechaISO,
    };

    try {
      return await client.patch(`servicios/${id}/`, payload);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404 || status === 405 || status === 400) {
        return client.patch('servicios/', payload);
      }
      throw error;
    }
  });

export const getMetricasPerfilApi = (fechaInicio: string, fechaFin: string) =>
  requestWithFallback((client) =>
    client.get('servicios/metricas/', {
      params: {
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
      },
    }),
  );

export default clients[0];