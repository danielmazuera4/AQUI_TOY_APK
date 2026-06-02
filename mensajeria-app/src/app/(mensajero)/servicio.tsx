import { useEffect, useRef, useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Animated, Alert, ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { completarPasoApi, getServicioDetalleApi } from '../../services/api';
import { MiniMap } from '../../components/mini-map';

function formatearFecha(valor?: string | null) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '-';
  return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatearHora(valor?: string | null) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '-';
  return fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function DetalleServicio() {
  const { id } = useLocalSearchParams();
  const { token, cargando: authCargando } = useAuth();
  const [servicio, setServicio] = useState<any>(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarMenu, setMostrarMenu] = useState(false);
  const [mostrarDetalles, setMostrarDetalles] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const puedeTomarFotos = servicio?.estado === 'en_progreso';

  useEffect(() => {
    if (authCargando) return;

    if (!token || !id) {
      setCargando(false);
      return;
    }

    void cargarServicio();
  }, [authCargando, id, token]);

  useFocusEffect(
    useCallback(() => {
      if (token && id && !authCargando) {
        void cargarServicio();
      }
    }, [token, id, authCargando])
  );

  async function cargarServicio() {
    setCargando(true);
    try {
      const response = await getServicioDetalleApi(Number(id));
      setServicio(response.data);
      
      const seguimiento2 = response.data?.seguimientos?.find((s: any) => s.paso === 2);
      const seguimiento3 = response.data?.seguimientos?.find((s: any) => s.paso === 3);
      
      if (!seguimiento2 || !seguimiento3) {
        const key = `@servicio_${id}_progreso`;
        try {
          await AsyncStorage.removeItem(key);
        } catch {
        }
      }
    } catch {
      Alert.alert('Error', 'No se pudo cargar el servicio');
    } finally {
      setCargando(false);
    }
  }

  const tomarFotoPaso = async (paso: number) => {
    try {
      const permisos = await ImagePicker.requestCameraPermissionsAsync();
      if (!permisos.granted) {
        Alert.alert('Permiso requerido', 'Activa el permiso de cámara para tomar la foto.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
      });

      if (result.canceled) return;

      const formData = new FormData();
      formData.append('foto', {
        uri: result.assets[0].uri,
        type: 'image/jpeg',
        name: `paso_${paso}.jpg`,
      } as any);
      formData.append('completado', 'true');

      await completarPasoApi(Number(id), paso, formData);
      Alert.alert('¡Éxito!', 'Paso completado');
      await cargarServicio();
    } catch {
      Alert.alert('Error', 'No se pudo completar el paso');
    }
  };

  useEffect(() => {
    Animated.timing(menuAnim, {
      toValue: mostrarMenu ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [menuAnim, mostrarMenu]);

  useEffect(() => {
    if (!puedeTomarFotos) {
      setMostrarMenu(false);
    }
  }, [puedeTomarFotos]);

  if (cargando) {
    return (
      <View style={styles.centrado}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  const detalles = [
    ['Creado por el usuario:', servicio?.creado_por?.username || servicio?.cliente?.username || '-'],
    ['Telefono del solicitante:', servicio?.telefono_solicitante || '-'],
    ['Numero de rastreo:', servicio?.orden || '-'],
    ['Descripción:', servicio?.descripcion || '-'],
    ['Nombre del solicitante:', servicio?.nombre_solicitante || '-'],
    ['Fecha de solicitud:', formatearFecha(servicio?.fecha_creacion)],
    ['Hora de solicitud:', formatearHora(servicio?.fecha_creacion)],
    ['Ciudad de origen:', servicio?.ciudad_origen || '-'],
    ['Dirección de origen:', servicio?.origen || '-'],
    ['Ciudad de destino:', servicio?.ciudad_destino || '-'],
    ['Dirección de destino:', servicio?.destino || '-'],
    ['Fecha de entrega deseada:', formatearFecha(servicio?.fecha_entrega_deseada)],
    ['Nombre de quien recibe:', servicio?.nombre_quien_recibe || '-'],
    ['Telefono de quien recibe:', servicio?.telefono_quien_recibe || '-'],
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.shell}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backTexto}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitulo}>Servicios en progreso</Text>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.cardTitulo}>{servicio?.cliente?.empresa?.nombre || 'Detalle del servicio'}</Text>
            {servicio?.prioridad === 'alta' && <Text style={styles.badgeAltaTexto}>PRIORIDAD ALTA</Text>}
          </View>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Orden #</Text>
              <Text style={styles.summaryValue}>{servicio?.orden || '-'}</Text>
              <Text style={styles.summaryLabel}>Sede</Text>
              <Text style={styles.summaryValue}>{servicio?.sede || '-'}</Text>
              <Text style={styles.summaryLabel}>Area</Text>
              <Text style={styles.summaryValue}>{servicio?.area || '-'}</Text>
              <Text style={styles.summaryLabel}>Origen</Text>
              <Text style={styles.summaryValue} numberOfLines={3}>{servicio?.origen || '-'}</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Recogida</Text>
              <Text style={styles.summaryValue} numberOfLines={2}>{servicio?.nombre_solicitante || '-'}</Text>
              <Text style={styles.summaryLabel}>Tipo Vehiculo</Text>
              <Text style={styles.summaryValue}>{servicio?.tipo_vehiculo || '-'}</Text>
              <Text style={styles.summaryLabel}>Destino</Text>
              <Text style={styles.summaryValue} numberOfLines={3}>{servicio?.destino || '-'}</Text>
            </View>
          </View>

          <View style={styles.detailsToggleBar}>
            <Text style={styles.detailsLabel}>{puedeTomarFotos ? 'SEGUIMIENTO' : 'DETALLE'}</Text>
            <TouchableOpacity style={styles.detailsButton} onPress={() => setMostrarDetalles(true)} activeOpacity={0.85}>
              <Text style={styles.detailsButtonText}>{puedeTomarFotos ? 'Mas Detalles' : 'Ver más detalles'}</Text>
            </TouchableOpacity>
            {puedeTomarFotos ? (
              <TouchableOpacity
                onPress={() => setMostrarMenu((value) => !value)}
                style={[styles.menuToggleButton, mostrarMenu && styles.menuToggleButtonActive]}
                activeOpacity={0.8}
              >
                <Text style={styles.menuToggleLabel}>{mostrarMenu ? 'Fotos' : 'Fotos'}</Text>
                <Text style={styles.arrow}>{mostrarMenu ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {puedeTomarFotos ? (
            <Animated.View
              style={[
                styles.menuWrap,
                {
                  maxHeight: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 420] }),
                  opacity: menuAnim,
                  transform: [
                    {
                      translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.menuDesplegable}>
                <View style={styles.menuPaso}>
                  <View style={styles.menuPasoNumero}><Text style={styles.menuPasoNumeroTexto}>2</Text></View>
                  <View style={styles.menuPasoContenido}>
                    <Text style={styles.menuPasoTitulo}>Recogida</Text>
                    <Text style={styles.menuPasoSubtitulo}>{servicio?.origen || '-'}</Text>
                    <TouchableOpacity style={styles.menuAccion} onPress={() => tomarFotoPaso(2)}>
                      <Text style={styles.menuAccionTexto}>📷 Subir foto de recogida</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.menuPasoSeparador} />

                <View style={styles.menuPaso}>
                  <View style={styles.menuPasoNumero}><Text style={styles.menuPasoNumeroTexto}>3</Text></View>
                  <View style={styles.menuPasoContenido}>
                    <Text style={styles.menuPasoTitulo}>Entrega</Text>
                    <Text style={styles.menuPasoSubtitulo}>{servicio?.destino || '-'}</Text>
                    <TouchableOpacity style={styles.menuAccion} onPress={() => tomarFotoPaso(3)}>
                      <Text style={styles.menuAccionTexto}>📷 Subir foto de entrega</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.mapWrap}>
                  <MiniMap
                    origenLat={servicio?.origen_lat}
                    origenLng={servicio?.origen_lng}
                    destinoLat={servicio?.destino_lat}
                    destinoLng={servicio?.destino_lng}
                    mensajeroLat={servicio?.mensajero_lat}
                    mensajeroLng={servicio?.mensajero_lng}
                    height={170}
                  />
                </View>
              </View>
            </Animated.View>
          ) : null}
        </View>
      </View>

      <Modal visible={mostrarDetalles} transparent animationType="fade" onRequestClose={() => setMostrarDetalles(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMostrarDetalles(false)}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Detalle del servicio</Text>
              <View style={styles.modalGrid}>
                {detalles.map(([label, value], index) => (
                  <Text key={`detalle-${index}`}>
                    <Text style={styles.modalLabel}>{label} </Text>
                    {value}
                  </Text>
                ))}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setMostrarDetalles(false)}>
              <Text style={styles.modalCloseText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { paddingBottom: 24 },
  shell: { padding: 10 },
  centrado: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, marginBottom: 12 },
  backBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  backTexto: { color: '#111827', fontSize: 14, fontWeight: '700' },
  headerTitulo: { color: '#111827', fontSize: 22, fontWeight: '900' },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: '#9ca3af',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  panelHeader: { alignItems: 'center', marginBottom: 14 },
  cardTitulo: { fontSize: 24, fontWeight: '900', color: '#404040', textAlign: 'center' },
  badgeAltaTexto: { color: '#ef4444', fontSize: 12, fontWeight: '800', alignSelf: 'flex-start', marginTop: 8 },
  summaryGrid: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  summaryColumn: { flex: 1 },
  summaryDivider: { width: 1, backgroundColor: '#9ca3af', marginVertical: 8 },
  summaryLabel: { fontSize: 11, color: '#3f3f46', fontWeight: '800', marginTop: 7 },
  summaryValue: { fontSize: 13, color: '#404040', fontWeight: '600', lineHeight: 18 },
  detailsToggleBar: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d4d4d8',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  detailsLabel: { fontSize: 18, fontWeight: '800', color: '#525252' },
  detailsButton: { borderWidth: 1, borderColor: '#1d4ed8', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#fff' },
  detailsButtonText: { color: '#1d4ed8', fontWeight: '800', fontSize: 13 },
  menuToggleButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  menuToggleButtonActive: {
    borderColor: '#1d4ed8',
    backgroundColor: '#eff6ff',
  },
  menuToggleLabel: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' },
  arrow: { fontSize: 22, lineHeight: 22, color: '#111827', fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 },
  modalCard: {
    backgroundColor: '#e7e7e7',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
    maxHeight: '86%',
    borderWidth: 1,
    borderColor: '#7a7a7a',
    elevation: 5,
  },
  modalScroll: { paddingBottom: 10 },
  modalTitle: { textAlign: 'center', fontSize: 24, fontWeight: '900', color: '#4a4a4a', marginBottom: 14 },
  modalGrid: { gap: 4 },
  modalLine: { fontSize: 14, color: '#2f2f2f', lineHeight: 22, marginBottom: 4, fontWeight: '600' },
  modalLabel: { fontWeight: '900', color: '#222' },
  modalCloseButton: {
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#4f93e6',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 10,
    minWidth: 96,
  },
  modalCloseText: { color: '#1d4ed8', fontWeight: '900', textAlign: 'center' },
  menuWrap: { overflow: 'hidden' },
  menuDesplegable: { paddingTop: 16, paddingHorizontal: 4 },
  menuPaso: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  menuPasoNumero: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#4b5563', alignItems: 'center', justifyContent: 'center' },
  menuPasoNumeroTexto: { color: '#fff', fontWeight: '900', fontSize: 14 },
  menuPasoContenido: { flex: 1 },
  menuPasoTitulo: { fontSize: 13, fontWeight: '900', color: '#2b2b2b' },
  menuPasoSubtitulo: { fontSize: 12, color: '#4b5563', marginTop: 4, lineHeight: 16, fontWeight: '600' },
  menuAccion: { marginTop: 8 },
  menuAccionTexto: { color: '#1d4ed8', fontSize: 13, fontWeight: '800' },
  menuPasoSeparador: { height: 14 },
  mapWrap: { marginTop: 14 },
});