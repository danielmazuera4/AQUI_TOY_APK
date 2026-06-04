import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
  Alert,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { fetchGoogleDirections, decodePolyline } from '../services/googleDirections';

type RouteModalProps = {
  visible: boolean;
  onClose: () => void;
  servicio: {
    id: number;
    origen: string;
    destino: string;
    estado?: string;
    origen_lat?: number | null;
    origen_lng?: number | null;
    destino_lat?: number | null;
    destino_lng?: number | null;
    mensajero_lat?: number | null;
    mensajero_lng?: number | null;
    origenLat?: number | null;
    origenLng?: number | null;
    destinoLat?: number | null;
    destinoLng?: number | null;
    mensajeroLat?: number | null;
    mensajeroLng?: number | null;
    latitude?: number | null;
    lat?: number | null;
    longitude?: number | null;
    lng?: number | null;
    dest_latitude?: number | null;
    dest_lat?: number | null;
    dest_longitude?: number | null;
    dest_lng?: number | null;
    messenger_lat?: number | null;
    messengerLat?: number | null;
    messenger_lng?: number | null;
    messengerLng?: number | null;
  } | null;
};

export default function RouteModal({ visible, onClose, servicio }: RouteModalProps) {
  // Identificar si el hito de origen ya se cerró
  const origenCerrado = servicio?.estado === 'en_ruta' || servicio?.estado === 'recogido';
  const servicioCompletado = servicio?.estado === 'completado';
  
  const mapRef = useRef<MapView>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [region, setRegion] = useState<Region | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState(false);
  const [routeData, setRouteData] = useState<{
    decodedPoints: { latitude: number; longitude: number }[];
    distance: string;
    duration: string;
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // Reactividad inmediata con useMemo para coordenadas
  const coords = useMemo(() => {
    if (!servicio) return null;
    
    // Fallback hardcoded para cuando el backend envía null
    const latO = servicio.origen_lat ?? servicio.origenLat ?? servicio.latitude ?? servicio.lat ?? 3.4735;
    const lngO = servicio.origen_lng ?? servicio.origenLng ?? servicio.longitude ?? servicio.lng ?? -76.5205;
    const latD = servicio.destino_lat ?? servicio.destinoLat ?? servicio.dest_latitude ?? servicio.dest_lat ?? 3.4278;
    const lngD = servicio.destino_lng ?? servicio.destinoLng ?? servicio.dest_longitude ?? servicio.dest_lng ?? -76.5381;
    const latM = parseFloat(String(servicio.mensajero_lat ?? servicio.mensajeroLat ?? servicio.messenger_lat ?? servicio.messengerLat));
    const lngM = parseFloat(String(servicio.mensajero_lng ?? servicio.mensajeroLng ?? servicio.messenger_lng ?? servicio.messengerLng));

    const origenLatNum = parseFloat(String(latO));
    const origenLngNum = parseFloat(String(lngO));
    const destinoLatNum = parseFloat(String(latD));
    const destinoLngNum = parseFloat(String(lngD));

    return {
      origen: isNaN(origenLatNum) || isNaN(origenLngNum) ? null : { latitude: origenLatNum, longitude: origenLngNum },
      destino: isNaN(destinoLatNum) || isNaN(destinoLngNum) ? null : { latitude: destinoLatNum, longitude: destinoLngNum },
      mensajero: isNaN(latM) || isNaN(lngM) ? null : { latitude: latM, longitude: lngM }
    };
  }, [servicio]);

  useEffect(() => {
    if (visible && servicio) {
      requestLocationPermission();
      fetchRoute(coords);
    }
  }, [visible, servicio, coords]);

  useEffect(() => {
    if (mapReady && (coords?.origen || coords?.destino)) {
      fitMapToCoordinates();
    }
  }, [mapReady, coords]);

  const requestLocationPermission = async () => {
    try {
      let hasPermission = false;

      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted) {
          hasPermission = true;
          setLocationPermission(true);
        } else {
          const requestResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: 'Permiso de Ubicación',
              message: 'Aquitoy necesita acceso a tu ubicación para mostrar el mapa',
              buttonNeutral: 'Preguntar después',
              buttonNegative: 'Cancelar',
              buttonPositive: 'OK',
            }
          );
          hasPermission = requestResult === PermissionsAndroid.RESULTS.GRANTED;
          setLocationPermission(hasPermission);
        }
      } else {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          hasPermission = true;
          setLocationPermission(true);
        } else {
          const { status: requestStatus } = await Location.requestForegroundPermissionsAsync();
          hasPermission = requestStatus === 'granted';
          setLocationPermission(hasPermission);
        }
      }

      if (hasPermission) {
        getCurrentLocation();
      } else {
        setLoading(false);
      }
    } catch (error) {
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCurrentLocation(location);
      fitMapToCoordinates();
    } catch (error) {
      fitMapToCoordinates();
    } finally {
      setLoading(false);
    }
  };

  const fetchRoute = async (coordsData: typeof coords) => {
    if (!coordsData) return;

    // La ruta debe ir desde el mensajero (o su ubicación actual) hasta el siguiente hito
    const startLat = currentLocation?.coords.latitude || coordsData?.mensajero?.latitude;
    const startLng = currentLocation?.coords.longitude || coordsData?.mensajero?.longitude;
    const target = !origenCerrado ? coordsData?.origen : coordsData?.destino;

    if (!startLat || !startLng || !target) return;

    setRouteData(null);
    setRouteLoading(true);

    try {
      const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || 
                                  'AIzaSyAct3GRpIYIzZouX_-ctsQbHVwjPTGt4sQ';

      const result = await fetchGoogleDirections(
        startLat,
        startLng,
        target.latitude,
        target.longitude,
        GOOGLE_MAPS_API_KEY
      );

      if (result) {
        setRouteData({
          decodedPoints: result.decodedPoints,
          distance: result.distance,
          duration: result.duration,
        });

        setTimeout(() => {
          const coordinatesToFit = [coordsData.origen, coordsData.destino, ...(coordsData.mensajero ? [coordsData.mensajero] : [])].filter((c): c is { latitude: number; longitude: number } => c !== null);
          mapRef.current?.fitToCoordinates(
            coordinatesToFit,
            {
              edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
              animated: true,
            }
          );
        }, 500);
      }
    } catch (error) {
      console.error("Error fetching directions:", error);
      Alert.alert("Error de Ruta", "No se pudo obtener la ruta desde Google Maps API.");
    } finally {
      setRouteLoading(false);
    }
  };

  const fitMapToCoordinates = () => {
    if (!coords) return;

    const coordinates: { latitude: number; longitude: number }[] = [];

    if (coords.origen) {
      coordinates.push(coords.origen);
    }
    if (coords.destino) {
      coordinates.push(coords.destino);
    }
    if (coords.mensajero) {
      coordinates.push(coords.mensajero);
    }
    if (currentLocation) {
      coordinates.push({ latitude: currentLocation.coords.latitude, longitude: currentLocation.coords.longitude });
    }

    if (coordinates.length === 0) {
      setLoading(false);
      return;
    }

    const latitudes = coordinates.map((c) => c.latitude);
    const longitudes = coordinates.map((c) => c.longitude);

    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    const latDelta = (maxLat - minLat) * 1.5 || 0.01;
    const lngDelta = (maxLng - minLng) * 1.5 || 0.01;

    const newRegion: Region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latDelta, 0.01),
      longitudeDelta: Math.max(lngDelta, 0.01),
    };

    setRegion(newRegion);

    setTimeout(() => {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }, 100);
  };

  const renderRoute = () => {
    if (routeData && routeData.decodedPoints.length > 1) {
      return (
        <Polyline
          coordinates={routeData.decodedPoints}
          strokeColor="#C8102E"
          strokeWidth={4}
          lineDashPattern={[]}
        />
      );
    }

    if (!coords) return null;

    const coordinates: { latitude: number; longitude: number }[] = [];

    // Polyline dinámica según estado del origen
    if (coords.mensajero) {
      coordinates.push(coords.mensajero);
    }
    if (!origenCerrado && coords.origen) {
      coordinates.push(coords.origen);
    } else if (origenCerrado && coords.destino) {
      coordinates.push(coords.destino);
    }

    if (coordinates.length < 2) {
      return null;
    }

    return (
      <Polyline
        coordinates={coordinates}
        strokeColor="#2563eb"
        strokeWidth={3}
        lineDashPattern={[1]}
      />
    );
  };

  const renderFallbackPolyline = () => {
    if (!coords?.origen || !coords?.destino) return null;
    return (
      <Polyline
        coordinates={[coords.origen, coords.destino]}
        strokeColor="#9ca3af"
        strokeWidth={2}
        lineDashPattern={[5, 5]}
      />
    );
  };

  if (!servicio) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.title}>Ruta del Servicio</Text>
          <View style={styles.placeholder} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Cargando mapa...</Text>
          </View>
        ) : (
          <>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              region={region}
              showsUserLocation
              showsMyLocationButton
              followsUserLocation={false}
              onMapReady={() => setMapReady(true)}
            >
              {coords?.origen && (
                <Marker
                  coordinate={coords.origen}
                  title="Punto A (Origen)"
                  description={servicio?.origen || ''}
                  pinColor={origenCerrado ? '#16a34a' : '#ef4444'}
                >
                  <View style={[styles.markerLabel, { backgroundColor: origenCerrado ? '#16a34a' : '#ef4444' }]}><Text style={styles.markerLabelText}>A</Text></View>
                </Marker>
              )}

              {coords?.destino && (
                <Marker
                  coordinate={coords.destino}
                  title="Punto B (Destino)"
                  description={servicio?.destino || ''}
                  pinColor={servicioCompletado ? '#16a34a' : '#ef4444'}
                >
                  <View style={[styles.markerLabel, { backgroundColor: servicioCompletado ? '#16a34a' : '#ef4444' }]}><Text style={styles.markerLabelText}>B</Text></View>
                </Marker>
              )}

              {coords?.mensajero && (
                <Marker
                  coordinate={coords.mensajero}
                  title="Mensajero"
                  description="Ubicación actual del mensajero"
                  pinColor="#f59e0b"
                />
              )}

              {renderRoute()}
              {renderFallbackPolyline()}
            </MapView>

            <View style={styles.infoContainer}>
              <View style={styles.infoItem}>
                <View style={[styles.dot, { backgroundColor: '#2563eb' }]} />
                <Text style={styles.infoText}>Origen: {servicio.origen}</Text>
              </View>
              <View style={styles.infoItem}>
                <View style={[styles.dot, { backgroundColor: '#16a34a' }]} />
                <Text style={styles.infoText}>Destino: {servicio.destino}</Text>
              </View>
              {coords?.mensajero && (
                <View style={styles.infoItem}>
                  <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
                  <Text style={styles.infoText}>🛵 Mensajero en ruta</Text>
                </View>
              )}
              {currentLocation && (
                <View style={styles.infoItem}>
                  <View style={[styles.dot, { backgroundColor: '#8b5cf6' }]} />
                  <Text style={styles.infoText}>📍 Tu ubicación actual</Text>
                </View>
              )}
              {routeData && (
                <>
                  <View style={styles.infoItem}>
                    <View style={[styles.dot, { backgroundColor: '#6b7280' }]} />
                    <Text style={styles.infoText}>📏 Distancia: {routeData.distance}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <View style={[styles.dot, { backgroundColor: '#6b7280' }]} />
                    <Text style={styles.infoText}>⏱️ Tiempo estimado: {routeData.duration}</Text>
                  </View>
                </>
              )}
              {routeLoading && (
                <View style={styles.infoItem}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={[styles.infoText, { marginLeft: 8 }]}>Calculando ruta...</Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  placeholder: {
    width: 44,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  infoContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
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
