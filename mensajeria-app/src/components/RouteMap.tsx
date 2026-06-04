import { useEffect, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Alert, PermissionsAndroid, Platform, Text } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { fetchGoogleDirections, decodePolyline } from '../services/googleDirections';

type Hito = {
  id: number;
  paso: number;
  descripcion: string;
  completado: boolean;
  foto?: string | null;
  lat?: number | null;
  lng?: number | null;
};

type RouteMapProps = {
  servicioId: number;
  origenLat?: number | null;
  origenLng?: number | null;
  destinoLat?: number | null;
  destinoLng?: number | null;
  hitos: Hito[];
  onHitoCompletado?: (paso: number) => void;
  googleApiKey: string;
  servicioFinalizado?: boolean;
};

const DEVIO_MAXIMO_METROS = 100;

export function RouteMap({
  servicioId,
  origenLat,
  origenLng,
  destinoLat,
  destinoLng,
  hitos,
  onHitoCompletado,
  googleApiKey,
  servicioFinalizado = false,
}: RouteMapProps) {
  const [ubicacionActual, setUbicacionActual] = useState<Location.LocationObject | null>(null);
  const [ruta, setRuta] = useState<{ latitude: number; longitude: number }[]>([]);
  const [siguienteHito, setSiguienteHito] = useState<Hito | null>(null);
  const [hitosLocales, setHitosLocales] = useState<Hito[]>(hitos);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [permisoConcedido, setPermisoConcedido] = useState(false);
  
  const watchId = useRef<Location.LocationSubscription | null>(null);
  const ultimaRutaCalculada = useRef<{ latitude: number; longitude: number }[]>([]);
  const ultimaUbicacionEnRuta = useRef<{ lat: number; lng: number } | null>(null);

  // Solicitar permisos de ubicación
  useEffect(() => {
    (async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Permiso de ubicación',
            message: 'La app necesita acceso a tu ubicación para mostrar la ruta en tiempo real',
            buttonNeutral: 'Preguntar después',
            buttonNegative: 'Cancelar',
            buttonPositive: 'OK',
          }
        );
        setPermisoConcedido(granted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setPermisoConcedido(status === 'granted');
      }
    })();
  }, []);

  // Calcular distancia entre dos puntos en metros (fórmula de Haversine)
  const calcularDistancia = useCallback((lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }, []);

  // Calcular distancia de un punto a una polyline (ruta)
  const calcularDistanciaARuta = useCallback((point: { lat: number; lng: number }, polyline: { latitude: number; longitude: number }[]): number => {
    if (polyline.length < 2) return Infinity;

    let minDist = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
      const dist = distanciaPuntoASegmento(
        point,
        { lat: polyline[i].latitude, lng: polyline[i].longitude },
        { lat: polyline[i + 1].latitude, lng: polyline[i + 1].longitude }
      );
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }, []);

  // Distancia de punto a segmento de línea
  const distanciaPuntoASegmento = (point: { lat: number; lng: number }, lineStart: { lat: number; lng: number }, lineEnd: { lat: number; lng: number }): number => {
    const A = point.lat - lineStart.lat;
    const B = point.lng - lineStart.lng;
    const C = lineEnd.lat - lineStart.lat;
    const D = lineEnd.lng - lineStart.lng;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.lat;
      yy = lineStart.lng;
    } else if (param > 1) {
      xx = lineEnd.lat;
      yy = lineEnd.lng;
    } else {
      xx = lineStart.lat + param * C;
      yy = lineStart.lng + param * D;
    }

    const dx = point.lat - xx;
    const dy = point.lng - yy;
    return Math.sqrt(dx * dx + dy * dy) * 111320; // Convertir grados a metros (aproximado)
  };

  // Calcular ruta desde ubicación actual hasta el siguiente hito
  const calcularRuta = useCallback(async (origen: { lat: number; lng: number }, destino: { lat: number; lng: number }) => {
    setCargandoRuta(true);
    try {
      const resultado = await fetchGoogleDirections(origen.lat, origen.lng, destino.lat, destino.lng, googleApiKey);
      if (resultado && resultado.decodedPoints) {
        setRuta(resultado.decodedPoints);
        ultimaRutaCalculada.current = resultado.decodedPoints;
      }
    } catch (error) {
      Alert.alert('Error de Mapa', 'No se pudo trazar la ruta por calles. Verifique su conexión o API Key.');
      console.error('Error al calcular ruta:', error);
    } finally {
      setCargandoRuta(false);
    }
  }, [googleApiKey]);

  // Determinar el siguiente hito pendiente
  const determinarSiguienteHito = useCallback(() => {
    const hitosPendientes = hitosLocales.filter(h => !h.completado).sort((a, b) => a.paso - b.paso);
    return hitosPendientes.length > 0 ? hitosPendientes[0] : null;
  }, [hitosLocales]);

  // Iniciar rastreo GPS optimizado (solo por distancia)
  useEffect(() => {
    if (!permisoConcedido || servicioFinalizado) return;

    const iniciarRastreo = async () => {
      try {
        if (watchId.current) await watchId.current.remove();
        
        watchId.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 50, // Reportar solo cada 50 metros
          },
          (location) => {
            setUbicacionActual(location);
          }
        );
      } catch (error) {
        console.error('Error al iniciar rastreo GPS:', error);
      }
    };

    iniciarRastreo();

    return () => {
      watchId.current?.remove();
      watchId.current = null;
    };
  }, [permisoConcedido, servicioFinalizado]);

  // Calcular ruta inicial cuando cambia el siguiente hito
  useEffect(() => {
    if (servicioFinalizado) {
      setRuta([]);
      return;
    }

    const siguiente = determinarSiguienteHito();
    setSiguienteHito(siguiente);

    if (siguiente && siguiente.lat && siguiente.lng && ubicacionActual) {
      calcularRuta(
        { lat: ubicacionActual.coords.latitude, lng: ubicacionActual.coords.longitude },
        { lat: siguiente.lat, lng: siguiente.lng }
      );
    } else if (siguiente && siguiente.lat && siguiente.lng && origenLat && origenLng) {
      // Si no hay ubicación GPS aún, usar origen como punto de partida
      calcularRuta(
        { lat: origenLat, lng: origenLng },
        { lat: siguiente.lat, lng: siguiente.lng }
      );
    }
  }, [hitosLocales, servicioFinalizado, determinarSiguienteHito, calcularRuta, ubicacionActual, origenLat, origenLng]);

  // Sincronizar hitos locales con props (solo cuando cambian explícitamente)
  useEffect(() => {
    setHitosLocales(hitos);
  }, [hitos]);

  // Detener rastreo cuando el servicio finaliza
  useEffect(() => {
    if (servicioFinalizado && watchId.current) {
      watchId.current.remove();
      watchId.current = null;
    }
  }, [servicioFinalizado]);

  // Obtener coordenadas de un hito
  const obtenerCoordenadasHito = (hito: Hito): { latitude: number; longitude: number } | null => {
    if (hito.lat && hito.lng) {
      return { latitude: hito.lat, longitude: hito.lng };
    }
    
    // Si el hito no tiene coordenadas explícitas, usar origen/destino del servicio
    if (hito.paso === 2 && origenLat && origenLng) {
      return { latitude: origenLat, longitude: origenLng };
    }
    if (hito.paso === 3 && destinoLat && destinoLng) {
      return { latitude: destinoLat, longitude: destinoLng };
    }
    
    return null;
  };

  // Color del marcador según estado
  const getColorMarcador = (hito: Hito): string => {
    if (servicioFinalizado) return '#22c55e'; // Verde cuando servicio finaliza
    return hito.completado ? '#22c55e' : '#ef4444'; // Verde=completado, Rojo=pendiente
  };

  const getLetraHito = (paso: number): string => {
    if (paso === 2) return 'A';
    if (paso === 3) return 'B';
    if (paso >= 4) return 'C';
    return '';
  };

  // Región inicial del mapa
  const regionInicial = ubicacionActual ? {
    latitude: ubicacionActual.coords.latitude,
    longitude: ubicacionActual.coords.longitude,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : (origenLat && origenLng ? {
    latitude: origenLat,
    longitude: origenLng,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  } : {
    latitude: 3.4516,
    longitude: -76.5319,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  });

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={regionInicial}
        showsUserLocation
        showsMyLocationButton
        followsUserLocation={false}
      >
        {/* Ruta calculada */}
        {ruta.length > 0 && (
          <Polyline
            coordinates={ruta}
            strokeColor="#C8102E"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* Marcador de ubicación actual */}
        {ubicacionActual && (
          <Marker
            coordinate={{
              latitude: ubicacionActual.coords.latitude,
              longitude: ubicacionActual.coords.longitude,
            }}
            title="Tu ubicación"
            description="Mensajero"
            identifier="mensajero"
          />
        )}

        {/* Marcadores de hitos */}
        {hitosLocales.map((hito) => {
          const coords = obtenerCoordenadasHito(hito);
          if (!coords) return null;

          return (
            <Marker
              key={hito.id}
              coordinate={coords}
              title={`Punto ${getLetraHito(hito.paso)}`}
              description={hito.descripcion || (hito.completado ? 'Completado' : 'Pendiente')}
              pinColor={getColorMarcador(hito)}
              identifier={`hito-${hito.id}`}
            >
               <View style={[styles.markerLabel, { backgroundColor: getColorMarcador(hito) }]}><Text style={styles.markerLabelText}>{getLetraHito(hito.paso)}</Text></View>
            </Marker>
          );
        })}

        {/* Marcador de origen */}
        {origenLat && origenLng && (
          <Marker
            coordinate={{ latitude: origenLat, longitude: origenLng }}
            title="Origen"
            pinColor="#3b82f6"
            identifier="origen"
          />
        )}

        {/* Marcador de destino */}
        {destinoLat && destinoLng && (
          <Marker
            coordinate={{ latitude: destinoLat, longitude: destinoLng }}
            title="Destino"
            pinColor="#16a34a"
            identifier="destino"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: 300,
  },
  map: {
    flex: 1,
  },
  markerLabel: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerLabelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
