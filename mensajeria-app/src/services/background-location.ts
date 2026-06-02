import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import api from './api';

export const BACKGROUND_LOCATION_TASK = 'aquitoy-background-location';
const ACTIVE_SERVICE_KEY = 'aquitoy-active-service-id';

type BackgroundLocationData = {
  locations?: Location.LocationObject[];
};

// Esta tarea vive fuera de React para seguir mandando la ubicación aunque la pantalla se cierre.
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    return;
  }

  const payload = data as BackgroundLocationData | undefined;
  const latestLocation = payload?.locations?.[0];
  const activeServiceId = await AsyncStorage.getItem(ACTIVE_SERVICE_KEY);

  if (!latestLocation || !activeServiceId) {
    return;
  }

  try {
    await api.post(`/servicios/${activeServiceId}/ubicacion/`, {
      latitud: latestLocation.coords.latitude,
      longitud: latestLocation.coords.longitude,
    });
  } catch {
    return;
  }
});

async function ensurePermissions() {
  // Primero pedimos ubicación en primer plano, y luego la de segundo plano.
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return false;
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.status === 'granted';
}

export async function setActiveServiceId(serviceId: number) {
  await AsyncStorage.setItem(ACTIVE_SERVICE_KEY, String(serviceId));
}

export async function getActiveServiceId() {
  return AsyncStorage.getItem(ACTIVE_SERVICE_KEY);
}

export async function startBackgroundTracking(serviceId: number) {
  const permissionsGranted = await ensurePermissions();
  if (!permissionsGranted) {
    return false;
  }

  await setActiveServiceId(serviceId);

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (!alreadyStarted) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 20,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: 'Aquitoy activo',
        notificationBody: 'Compartiendo ubicación del mensajero en tiempo real',
      },
    });
  }

  return true;
}

export async function stopBackgroundTracking() {
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);

  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }

  await AsyncStorage.removeItem(ACTIVE_SERVICE_KEY);
}