import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { aceptarServicioApi, abandonarServicioApi, getServiciosApi, reportarNovedadApi, completarPasoApi, cerrarServicioApi } from '../../services/api';
import { typography } from '../../theme/typography';

const TAB_KEYS = ['progreso', 'disponibles', 'terminados'] as const;
type TabKey = (typeof TAB_KEYS)[number];
const EVIDENCE_PASOS = [2, 3] as const;
const NOVEDAD_OPCIONES = ['Trancón / Tráfico', 'Problema mecánico', 'Dirección incorrecta', 'Cliente no contesta', 'Otros...'] as const;
const ABANDONO_OPCIONES = ['Falla mecánica', 'Problema de tránsito', 'Paquete muy grande', 'Emergencia personal', 'Otro'] as const;
const PAGE_SIZE = 15;
const crearProgresoStorageKey = (servicioId: number) => `@servicio_${servicioId}_progreso`;

type TabPaginationState = {
  page: number;
  hasNext: boolean;
  total: number;
  loadingMore: boolean;
};

type PasoEvidenciaEstado = {
  fotoSubida: boolean;
  descripcionEscrita: boolean;
  fotoUri: string | null;
  descripcion: string | null;
};

function normalizarLista(data: any) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function extraerRespuestaLista(responseData: any) {
  const lista = normalizarLista(responseData);
  const total = Number(responseData?.count ?? lista.length ?? 0);
  const hasNext = Boolean(responseData?.next);
  return { lista, total, hasNext };
}

function texto(valor: any) {
  if (valor === null || valor === undefined || valor === '') return '-';
  return String(valor);
}

function empresa(servicio: any) {
  return servicio?.cliente?.empresa?.nombre || servicio?.creado_por?.empresa?.nombre || servicio?.cliente?.username || servicio?.creado_por?.username || '-';
}

function mensajeroId(servicio: any) {
  return servicio?.mensajero?.id || servicio?.mensajero_id || null;
}

function formatearFechaHora(valor?: string | null) {
  if (!valor) return '-';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '-';
  return fecha.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function obtenerSeguimiento(servicio: any, paso: number) {
  return Array.isArray(servicio?.seguimientos)
    ? servicio.seguimientos.find((item: any) => Number(item.paso) === paso)
    : null;
}

function crearPasoKey(servicioId: number, paso: number) {
  return `${servicioId}-${paso}`;
}

function extraerEstadoPaso(servicio: any, paso: number): PasoEvidenciaEstado {
  const seguimiento = obtenerSeguimiento(servicio, paso);
  return {
    fotoSubida: Boolean(seguimiento?.foto),
    descripcionEscrita: Boolean(seguimiento?.descripcion),
    fotoUri: seguimiento?.foto ?? null,
    descripcion: seguimiento?.descripcion ?? null,
  };
}

function crearEstadoPasoVacio(): PasoEvidenciaEstado {
  return {
    fotoSubida: false,
    descripcionEscrita: false,
    fotoUri: null,
    descripcion: null,
  };
}

function crearSnapshotProgreso(servicioId: number, estados: Record<string, PasoEvidenciaEstado>) {
  const paso2 = estados[crearPasoKey(servicioId, 2)] ?? crearEstadoPasoVacio();
  const paso3 = estados[crearPasoKey(servicioId, 3)] ?? crearEstadoPasoVacio();

  return {
    fotoPaso2: paso2.fotoSubida,
    descripcionPaso2: paso2.descripcionEscrita,
    fotoPaso3: paso3.fotoSubida,
    descripcionPaso3: paso3.descripcionEscrita,
    fotoUriPaso2: paso2.fotoUri,
    descripcionTextoPaso2: paso2.descripcion,
    fotoUriPaso3: paso3.fotoUri,
    descripcionTextoPaso3: paso3.descripcion,
  };
}

const ServiceCard = memo(function ServiceCard({
  servicio,
  selected,
  onToggleSelected,
  onOpenDetails,
  onToggleExpanded,
  onPickImage,
  onOpenDescription,
  onReportIssue,
  estadoPaso2,
  estadoPaso3,
  expanded,
  selectable,
  tab,
  isCardBusy = false,
}: {
  servicio: any;
  selected: boolean;
  onToggleSelected: () => void;
  onOpenDetails: () => void;
  onToggleExpanded?: () => void;
  onPickImage?: (servicio: any, paso: number) => void;
  onOpenDescription?: (servicio: any, paso: number) => void;
  onReportIssue: () => void;
  estadoPaso2: PasoEvidenciaEstado;
  estadoPaso3: PasoEvidenciaEstado;
  expanded: boolean;
  selectable: boolean;
  tab: TabKey;
  isCardBusy?: boolean;
}) {
  const seguimiento1 = obtenerSeguimiento(servicio, 1);
  const esSoloLectura = tab === 'terminados';
  const puedeExpandirTimeline = tab !== 'disponibles';

  // REGLA 1: LA BASE DE DATOS MANDA (ESPEJO PASIVO)
  const hito2ExisteEnBackend = Boolean(servicio.seguimientos?.find((s: any) => Number(s.paso) === 2));
  const hito3ExisteEnBackend = Boolean(servicio.seguimientos?.find((s: any) => Number(s.paso) === 3));

  // REGLA 2: FORZAR ESTADO GRIS Y LIBRE SI NO EXISTE EN BACKEND
  const fotoPaso2 = hito2ExisteEnBackend;
  const descripcionPaso2 = hito2ExisteEnBackend;
  const fotoPaso3 = hito3ExisteEnBackend;
  const descripcionPaso3 = hito3ExisteEnBackend;

  const paso2Completo = hito2ExisteEnBackend;
  const paso3Completo = hito3ExisteEnBackend;

  const paso2Activo = !paso2Completo;
  const paso3Activo = paso2Completo && !paso3Completo;

  const railProgressLevel = paso3Completo ? 3 : paso2Completo ? 2 : 1;

  const renderActionButton = (
    label: string,
    iconName: keyof typeof Ionicons.glyphMap,
    done: boolean,
    disabled: boolean,
    onPress?: () => void,
  ) => {
    return (
      <TouchableOpacity
        onPress={(event) => {
          event.stopPropagation();
          if (!disabled) onPress?.();
        }}
        disabled={disabled}
        style={[
          styles.timelineActionButton,
          done && styles.timelineActionButtonDone,
          disabled && styles.timelineActionButtonDisabled,
        ]}
        activeOpacity={0.85}
      >
        <Ionicons name={iconName} size={15} style={[styles.timelineActionIcon, done && styles.evidenceSuccessIcon]} />
        <Text style={[styles.timelineActionText, done && styles.evidenceSuccessText]}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <Pressable
      disabled={isCardBusy}
      onPress={selectable && !isCardBusy && !expanded ? onToggleSelected : undefined}
      onLongPress={selectable && !isCardBusy && !expanded ? onToggleSelected : undefined}
      delayLongPress={3000}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        tab === 'disponibles' && selected && styles.cardSelectedDisponible,
        tab === 'progreso' && selected && styles.cardSelectedProgreso,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>{empresa(servicio)}</Text>
        {servicio?.prioridad === 'alta' ? (
          <View style={styles.priorityWrap}>
            <Text style={styles.priorityText}>PRIORIDAD ALTA</Text>
            <Text style={styles.priorityIcon}>🔔</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.cardBodyGrid}>
        <View style={styles.infoColumn}>
          <Text style={styles.infoLine}>
            <Text style={styles.infoLabelInline}>ORDEN #: </Text>
            <Text style={styles.infoValueInlineBold}>{texto(servicio?.orden)}</Text>
          </Text>

          <Text style={styles.infoLine} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.infoLabelInline}>Sede: </Text>
            <Text style={styles.infoValueInline}>{texto(servicio?.sede)}</Text>
          </Text>

          <Text style={styles.infoLine} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.infoLabelInline}>Area: </Text>
            <Text style={styles.infoValueInline}>{texto(servicio?.area)}</Text>
          </Text>

          <Text style={styles.infoAddress} numberOfLines={2} ellipsizeMode="tail">
            <Text style={styles.infoAddressLabel}>Origen: </Text>
            <Text>{texto(servicio?.origen)}</Text>
          </Text>
        </View>

        <View style={styles.infoDividerVertical} />

        <View style={styles.infoColumn}>
          <Text style={styles.infoLine} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.infoLabelInline}>RECOGIDA: </Text>
            <Text style={styles.infoValueInline}>{texto(servicio?.nombre_solicitante || servicio?.recogida)}</Text>
          </Text>

          <Text style={styles.infoLine} numberOfLines={1} ellipsizeMode="tail">
            <Text style={styles.infoLabelInline}>Tipo Vehiculo: </Text>
            <Text style={styles.infoValueInline}>{texto(servicio?.tipo_vehiculo)}</Text>
          </Text>

          <Text style={styles.infoAddress} numberOfLines={2} ellipsizeMode="tail">
            <Text style={styles.infoAddressLabel}>Destino: </Text>
            <Text>{texto(servicio?.destino)}</Text>
          </Text>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerActionsRow}>
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
            style={styles.detailsButton}
            activeOpacity={0.86}
          >
            <Text style={styles.detailsButtonText}>Más Detalles</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(servicio?.origen || '')}&destination=${encodeURIComponent(servicio?.destino || '')}`;
              Linking.openURL(url).catch(() => Alert.alert('Error', 'No se pudo abrir la ruta'));
            }}
            style={styles.routeButton}
            activeOpacity={0.86}
          >
            <Text style={styles.routeButtonText}>Ver Ruta</Text>
          </TouchableOpacity>
        </View>

        {puedeExpandirTimeline ? (
          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              onToggleExpanded?.();
            }}
            style={styles.chevronButton}
            activeOpacity={0.8}
          >
            <Text style={styles.chevronText}>{expanded ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {puedeExpandirTimeline && expanded ? (
        <View style={styles.timelineWrap}>
          <View style={styles.timelineBody}>
            <View style={styles.lineConnector} />
            <View
              style={[
                styles.lineConnectorProgress,
                railProgressLevel === 1 && styles.lineConnectorProgressZero,
                railProgressLevel === 2 && styles.lineConnectorProgressMid,
                railProgressLevel === 3 && styles.lineConnectorProgressFull,
              ]}
            />
            <View style={styles.timelineStagesColumn}>
              <View style={styles.timelineItem}>
                <View style={styles.leftColumn}>
                  <View style={styles.timelineRailDotTop} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTitle}>Mensajero asignado</Text>
                  <Text style={styles.timelineText}>{servicio?.mensajero?.username || '-'}</Text>
                  <Text style={styles.timelineMeta}>{formatearFechaHora(seguimiento1?.fecha || servicio?.fecha_creacion)}</Text>
                </View>
              </View>

              <View style={styles.timelineItem}>
                <View style={styles.leftColumn}>
                  <View style={[styles.timelineRailDotMiddle, railProgressLevel >= 2 && styles.timelineRailDotActive]} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineText}>{texto(servicio?.origen)}</Text>
                  <View style={styles.timelineControlsRow}>
                    <View style={styles.timelineActionsGroup}>
                      {!esSoloLectura && renderActionButton(
                        'Subir Foto',
                        'camera-outline',
                        fotoPaso2,
                        !paso2Activo,
                        () => onPickImage?.(servicio, 2),
                      )}
                      {!esSoloLectura && renderActionButton(
                        'Añadir descripción',
                        'document-text-outline',
                        descripcionPaso2,
                        !paso2Activo,
                        () => onOpenDescription?.(servicio, 2),
                      )}
                    </View>
                  </View>
                  <Text style={styles.timelineMeta}>
                    {obtenerSeguimiento(servicio, 2) ? formatearFechaHora(obtenerSeguimiento(servicio, 2).fecha) : '-'}
                  </Text>
                </View>
              </View>

              <View style={styles.timelineItem}>
                <View style={styles.leftColumn}>
                  <View style={[styles.timelineRailDotBottom, railProgressLevel >= 3 && styles.timelineRailDotActive]} />
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineText}>{texto(servicio?.destino)}</Text>
                  <View style={styles.timelineControlsRow}>
                    <View style={styles.timelineActionsGroup}>
                      {!esSoloLectura && renderActionButton(
                        'Subir Foto',
                        'camera-outline',
                        fotoPaso3,
                        !paso3Activo,
                        () => onPickImage?.(servicio, 3),
                      )}
                      {!esSoloLectura && renderActionButton(
                        'Añadir descripción',
                        'document-text-outline',
                        descripcionPaso3,
                        !paso3Activo,
                        () => onOpenDescription?.(servicio, 3),
                      )}
                    </View>
                  </View>
                  <Text style={styles.timelineMeta}>
                    {obtenerSeguimiento(servicio, 3) ? formatearFechaHora(obtenerSeguimiento(servicio, 3).fecha) : '-'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <TouchableOpacity
            onPress={(event) => {
              event.stopPropagation();
              onReportIssue();
            }}
            style={styles.reportButton}
            activeOpacity={0.86}
          >
            <Text style={styles.reportButtonText}>Reportar una novedad</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </Pressable>
  );
});

export default function InicioMensajero() {
  const { usuario, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<TabKey>('progreso');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serviciosProgreso, setServiciosProgreso] = useState<any[]>([]);
  const [serviciosDisponibles, setServiciosDisponibles] = useState<any[]>([]);
  const [serviciosTerminados, setServiciosTerminados] = useState<any[]>([]);
  const [loadedTabs, setLoadedTabs] = useState<Record<TabKey, boolean>>({
    progreso: false,
    disponibles: false,
    terminados: false,
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [servicioEnDetalle, setServicioEnDetalle] = useState<any | null>(null);
  const [detalleVisible, setDetalleVisible] = useState(false);
  const [modalHitoVisible, setModalHitoVisible] = useState(false);
  const [servicioHito, setServicioHito] = useState<any | null>(null);
  const [pasoHito, setPasoHito] = useState<number | null>(null);
  const [enviandoHito, setEnviandoHito] = useState(false);
  const [descripcionHito, setDescripcionHito] = useState('');
  const [fotoHitoUri, setFotoHitoUri] = useState<string | null>(null);
  const [estadosEvidencias, setEstadosEvidencias] = useState<Record<string, PasoEvidenciaEstado>>({});
  const [menuFotoVisible, setMenuHitoFotoVisible] = useState(false);
  const [novedadModalVisible, setNovedadModalVisible] = useState(false);
  const [novedadSeleccionada, setNovedadSeleccionada] = useState('');
  const [novedadTextoOtros, setNovedadTextoOtros] = useState('');
  const [novedadServicio, setNovedadServicio] = useState<any | null>(null);
  const [modalAbandonoVisible, setModalAbandonoVisible] = useState(false);
  const [motivoAbandonoSeleccionado, setMotivoAbandonoSeleccionado] = useState('');
  const [textoAbandonoOtro, setTextoAbandonoOtro] = useState('');
  const fade = useState(new Animated.Value(1))[0];
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(0)).current;
  const pagerRef = useRef<FlatList<TabKey> | null>(null);
  const [tabPagination, setTabPagination] = useState<Record<TabKey, TabPaginationState>>({
    progreso: { page: 0, hasNext: true, total: 0, loadingMore: false },
    disponibles: { page: 0, hasNext: true, total: 0, loadingMore: false },
    terminados: { page: 0, hasNext: true, total: 0, loadingMore: false },
  });
  const tabLayouts = useRef<Record<TabKey, { x: number; width: number } | null>>({
    progreso: null,
    disponibles: null,
    terminados: null,
  });
  const hitosCerrandoRef = useRef<Set<string>>(new Set());
  const serviciosCerrandoRef = useRef<Set<number>>(new Set());
  const isMountedRef = useRef(true);

  const counts = {
    progreso: tabPagination.progreso.total || serviciosProgreso.length,
    disponibles: tabPagination.disponibles.total || serviciosDisponibles.length,
    terminados: tabPagination.terminados.total || serviciosTerminados.length,
  };

  const buscarServicioPorId = useCallback((id: number) => {
    return (
      serviciosProgreso.find((s) => s.id === id) ||
      serviciosDisponibles.find((s) => s.id === id) ||
      serviciosTerminados.find((s) => s.id === id) ||
      null
    );
  }, [serviciosDisponibles, serviciosProgreso, serviciosTerminados]);

  const setEvidenciasDesdeLista = useCallback(async (lista: any[]) => {
    // 1. Pre-carga masiva de AsyncStorage para evitar múltiples accesos a disco
    const keys = lista.map(s => crearProgresoStorageKey(s.id));
    const pairs = await AsyncStorage.multiGet(keys);
    const storageSnapshots: Record<number, any> = {};

    pairs.forEach(([key, val]) => {
      if (val) {
        const id = Number(key.replace('@servicio_', '').replace('_progreso', ''));
        try { storageSnapshots[id] = JSON.parse(val); } catch {}
      }
    });

    setEstadosEvidencias((prev) => {
      const nextStates = { ...prev };

      for (const servicio of lista) {
        // SEGURIDAD DE ESPEJO: Solo procedemos si la API devolvió explícitamente la propiedad 'seguimientos'.
        // Si el campo no existe (listado parcial), mantenemos el estado local para no causar parpadeos.
        if (!Object.prototype.hasOwnProperty.call(servicio, 'seguimientos')) continue;

        for (const paso of EVIDENCE_PASOS) {
          const key = crearPasoKey(servicio.id, paso);
          const apiState = extraerEstadoPaso(servicio, paso);
          const apiTieneHito = apiState.fotoSubida || apiState.descripcionEscrita;

          if (apiTieneHito) {
            nextStates[key] = apiState;
          } else {
            // REGLA 3: LIMPIEZA INMEDIATA EN EL SET_ESTADO (ESPEJO ESTRICTO)
            // Si el backend no tiene el hito, eliminamos cualquier registro local para forzar el estado "libre/gris".
            delete nextStates[key];
          }
        }
      }

      return nextStates;
    });
  }, []);

  const getEvidenciaPaso = useCallback((servicio: any, paso: number) => {
    return estadosEvidencias[crearPasoKey(servicio.id, paso)] ?? {
      ...crearEstadoPasoVacio(),
    };
  }, [estadosEvidencias]);

  const persistirProgresoServicio = useCallback(async (servicioId: number, estados: Record<string, PasoEvidenciaEstado>) => {
    const snapshot = crearSnapshotProgreso(servicioId, estados);
    const key = crearProgresoStorageKey(servicioId);

    if (snapshot.fotoPaso3 && snapshot.descripcionPaso3) {
      await AsyncStorage.removeItem(key);
      return;
    }

    await AsyncStorage.setItem(key, JSON.stringify(snapshot));
  }, []);

  const marcarEvidenciaPaso = useCallback((servicioId: number, paso: number, patch: Partial<PasoEvidenciaEstado>) => {
    setEstadosEvidencias((prev) => {
      const next = {
        ...prev,
        [crearPasoKey(servicioId, paso)]: {
          ...(prev[crearPasoKey(servicioId, paso)] || crearEstadoPasoVacio()),
          ...patch,
        },
      };

      void persistirProgresoServicio(servicioId, next);
      return next;
    });
  }, [persistirProgresoServicio]);

  const animateTabIndicator = useCallback((nextTab: TabKey) => {
    const layout = tabLayouts.current[nextTab];
    if (!layout) return;

    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: layout.x,
        useNativeDriver: false,
        friction: 10,
        tension: 80,
      }),
      Animated.spring(indicatorW, {
        toValue: layout.width,
        useNativeDriver: false,
        friction: 10,
        tension: 80,
      }),
    ]).start();
  }, [indicatorW, indicatorX]);

  const switchTab = useCallback((nextTab: TabKey) => {
    if (nextTab === tab) return;

    animateTabIndicator(nextTab);
    setTab(nextTab);
    setSelectedIds([]);
    setExpandedId(null);
    const targetIndex = TAB_KEYS.indexOf(nextTab);
    pagerRef.current?.scrollToOffset({ offset: targetIndex * width, animated: true });
  }, [animateTabIndicator, tab, width]);

  const aplicarResultadoTab = useCallback(async (tabKey: TabKey, lista: any[], append: boolean, total: number, hasNext: boolean, page: number) => {
    if (tabKey === 'progreso') {
      setServiciosProgreso((prev) => (append ? [...prev, ...lista] : lista));
      await setEvidenciasDesdeLista(lista);
    }

    if (tabKey === 'disponibles') {
      setServiciosDisponibles((prev) => (append ? [...prev, ...lista] : lista));
    }

    if (tabKey === 'terminados') {
      setServiciosTerminados((prev) => (append ? [...prev, ...lista] : lista));
      await setEvidenciasDesdeLista(lista);
    }

    setTabPagination((prev) => ({
      ...prev,
      [tabKey]: {
        page,
        hasNext,
        total,
        loadingMore: false,
      },
    }));
  }, [setEvidenciasDesdeLista]);

  const cargarTab = useCallback(async (tabKey: TabKey, primerCarga = false) => {
    if (!usuario) return;

    if (!primerCarga) {
      setLoading(true);
    }

    try {
      const estado = tabKey === 'progreso' ? 'en_progreso' : tabKey === 'disponibles' ? 'sin_asignar' : 'terminado';
      const response = await getServiciosApi(estado, 1, PAGE_SIZE);
      const { lista, total, hasNext } = extraerRespuestaLista(response?.data);

      if (!isMountedRef.current) return;

      aplicarResultadoTab(tabKey, lista, false, total, hasNext, 1);

      setLoadedTabs((prev) => ({ ...prev, [tabKey]: true }));

      if (primerCarga && tabKey === 'progreso') {
        void prefetchTabs(['disponibles', 'terminados']);
      }
    } catch (error: any) {
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [aplicarResultadoTab, usuario]);

  const refreshAllTabs = useCallback(async () => {
    if (!usuario) return;

    setRefreshing(true);

    try {
      const promises = TAB_KEYS.map(async (tabKey) => {
        const estado = tabKey === 'progreso' ? 'en_progreso' : tabKey === 'disponibles' ? 'sin_asignar' : 'terminado';
        const response = await getServiciosApi(estado, 1, PAGE_SIZE);
        const { lista, total, hasNext } = extraerRespuestaLista(response?.data);

        if (!isMountedRef.current) return;

        aplicarResultadoTab(tabKey, lista, false, total, hasNext, 1);

        setLoadedTabs((prev) => ({ ...prev, [tabKey]: true }));
      });

      await Promise.all(promises);
    } catch (error: any) {
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [aplicarResultadoTab, usuario]);

  const cargarMasServicios = useCallback(async (tabKey: TabKey) => {
    if (!usuario) return;

    const metadata = tabPagination[tabKey];
    if (!metadata.hasNext || metadata.loadingMore) return;

    setTabPagination((prev) => ({
      ...prev,
      [tabKey]: {
        ...prev[tabKey],
        loadingMore: true,
      },
    }));

    try {
      const estado = tabKey === 'progreso' ? 'en_progreso' : tabKey === 'disponibles' ? 'sin_asignar' : 'terminado';
      const nextPage = metadata.page + 1;
      const response = await getServiciosApi(estado, nextPage, PAGE_SIZE);
      const data = response?.data ?? {};
      const lista = normalizarLista(data);
      const total = Number(data?.count ?? metadata.total ?? 0);
      const hasNext = Boolean(data?.next);

      aplicarResultadoTab(tabKey, lista, true, total, hasNext, nextPage);
    } catch {
      setTabPagination((prev) => ({
        ...prev,
        [tabKey]: {
          ...prev[tabKey],
          loadingMore: false,
        },
      }));
    }
  }, [aplicarResultadoTab, tabPagination, usuario]);

  const cerrarServicioDefinitivo = useCallback(async (servicioId: number) => {
    if (serviciosCerrandoRef.current.has(servicioId)) return;

    serviciosCerrandoRef.current.add(servicioId);
    const fechaCierre = new Date().toISOString();

    try {
      await cerrarServicioApi(servicioId, fechaCierre);
      await cargarTab('progreso');
      await cargarTab('terminados');
      switchTab('terminados');
    } catch {
      serviciosCerrandoRef.current.delete(servicioId);
    }
  }, [cargarTab, switchTab]);

  const prefetchTabs = useCallback(async (tabsToLoad: TabKey[]) => {
    for (const tabKey of tabsToLoad) {
      if (loadedTabs[tabKey]) continue;

      try {
        const estado = tabKey === 'disponibles' ? 'sin_asignar' : 'terminado';
        const response = await getServiciosApi(estado, 1, PAGE_SIZE);
        const { lista, total, hasNext } = extraerRespuestaLista(response?.data);

        if (!isMountedRef.current) return;

        aplicarResultadoTab(tabKey, lista, false, total, hasNext, 1);

        setLoadedTabs((prev) => ({ ...prev, [tabKey]: true }));
      } catch {
        // Prefetch en segundo plano: si falla, la pestaña se carga al abrirse.
      }
    }
  }, [aplicarResultadoTab, loadedTabs, usuario]);

  useEffect(() => {
    if (!usuario) return;
    setSelectedIds([]);
    setExpandedId(null);
  }, [tab, usuario]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!usuario || loadedTabs[tab]) return;
    void cargarTab(tab, tab === 'progreso');
    return () => {
      isMountedRef.current = false;
    };
  }, [tab, usuario, loadedTabs, cargarTab]);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [tab, fade]);

  useEffect(() => {
    if (!usuario) return;
    animateTabIndicator(tab);
    pagerRef.current?.scrollToOffset({ offset: TAB_KEYS.indexOf(tab) * width, animated: false });
  }, [animateTabIndicator, tab, usuario, width]);

  useFocusEffect(
    useCallback(() => {
      if (usuario) {
        // PROHIBIDO: No limpiar los estados de forma preventiva o agresiva bajo ninguna circunstancia.
        setSelectedIds([]);
        setExpandedId(null);
        setServicioEnDetalle(null);
        setDetalleVisible(false);
        setModalHitoVisible(false);
        setServicioHito(null);
        setPasoHito(null);
        setEnviandoHito(false);
        setDescripcionHito('');
        setFotoHitoUri(null);
        setMenuHitoFotoVisible(false);
        setNovedadModalVisible(false);
        setNovedadSeleccionada('');
        setNovedadTextoOtros('');
        setNovedadServicio(null);
        
        // Inmediatamente después, hacer el fetch a la API
        void refreshAllTabs();
      }
    }, [usuario, refreshAllTabs])
  );

  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((current) => current !== id) : [...prev, id]));
  }

  async function abandonarSeleccionados() {
    if (selectedIds.length === 0) return;
    setModalAbandonoVisible(true);
  }

  async function confirmarAbandono() {
    try {
      for (const id of selectedIds) {
        const motivoFinal = motivoAbandonoSeleccionado === 'Otro' ? textoAbandonoOtro.trim() : motivoAbandonoSeleccionado;
        if (!motivoFinal) {
          Alert.alert('Error', 'Debe seleccionar o escribir un motivo de abandono.');
          return;
        }

        await abandonarServicioApi(id, motivoFinal);
      }

      setSelectedIds([]);
      setModalAbandonoVisible(false);
      setMotivoAbandonoSeleccionado('');
      setTextoAbandonoOtro('');
      await refreshAllTabs();
      Alert.alert('Listo', 'Servicios abandonados y enviados a Disponibles.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudieron abandonar los servicios seleccionados.');
    }
  }

  // --- Evidence helpers ---
  async function pickAndUploadImage(servicioId: number, paso: number) {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permisos', 'Se requieren permisos de cámara.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      // soporte para versiones antiguas y nuevas
      if ((result as any).canceled === true || (result as any).cancelled === true) return;
      const uri = (result as any).uri || (result as any).assets?.[0]?.uri;
      if (!uri) return;
      setFotoHitoUri(uri);
      marcarEvidenciaPaso(servicioId, paso, { fotoSubida: true, fotoUri: uri });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo subir la foto');
    }
  }

  async function pickAndUploadImageFromLibrary(servicioId: number, paso: number) {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if ((result as any).canceled === true || (result as any).cancelled === true) return;
      const uri = (result as any).uri || (result as any).assets?.[0]?.uri;
      if (!uri) return;
      setFotoHitoUri(uri);
      marcarEvidenciaPaso(servicioId, paso, { fotoSubida: true, fotoUri: uri });
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo subir la foto');
    }
  }

  function limpiarEstadoHito() {
    setFotoHitoUri(null);
    setDescripcionHito('');
  }

  function prepararHito(servicio: any, paso: number) {
    const cambioHito = servicioHito?.id !== servicio?.id || pasoHito !== paso;
    setServicioHito(servicio);
    setPasoHito(paso);

    if (cambioHito) {
      limpiarEstadoHito();
    }
  }

  function openPhotoMenu(servicio: any, paso: number) {
    prepararHito(servicio, paso);
    setMenuHitoFotoVisible(true);
  }

  function closePhotoMenu() {
    setMenuHitoFotoVisible(false);
  }

  async function takePhotoFromCamera() {
    if (!servicioHito || pasoHito == null) return;
    const servicioId = servicioHito.id;
    const paso = pasoHito;
    closePhotoMenu();
    await pickAndUploadImage(servicioId, paso);
  }

  async function pickPhotoFromGallery() {
    if (!servicioHito || pasoHito == null) return;
    const servicioId = servicioHito.id;
    const paso = pasoHito;
    closePhotoMenu();
    await pickAndUploadImageFromLibrary(servicioId, paso);
  }

  function openDescriptionModal(servicio: any, paso: number) {
    prepararHito(servicio, paso);
    setModalHitoVisible(true);
  }

  function resetNovedadModal() {
    setNovedadModalVisible(false);
    setNovedadSeleccionada('');
    setNovedadTextoOtros('');
    setNovedadServicio(null);
  }

  function openNovedadModal(servicio: any) {
    setNovedadServicio(servicio);
    setNovedadSeleccionada('');
    setNovedadTextoOtros('');
    setNovedadModalVisible(true);
  }

  async function submitNovedad() {
    if (!novedadServicio) return;

    const textoNovedad = novedadSeleccionada === 'Otros...'
      ? novedadTextoOtros.trim()
      : novedadSeleccionada;

    if (!textoNovedad) {
      Alert.alert('Novedad', 'Selecciona una opción o escribe la novedad.');
      return;
    }

    try {
      await reportarNovedadApi(novedadServicio.id, textoNovedad);
      resetNovedadModal();
      Alert.alert('Listo', 'Novedad reportada correctamente.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo reportar la novedad');
    }
  }

  async function saveDescription() {
    if (!servicioHito || pasoHito == null) return;
    const servicioId = servicioHito.id;
    const paso = pasoHito;

    const evidenciaActual = estadosEvidencias[crearPasoKey(servicioId, paso)] || crearEstadoPasoVacio();
    const descripcionFinal = descripcionHito.trim();
    const fotoUriFinal = fotoHitoUri || evidenciaActual.fotoUri;

    if (!fotoUriFinal || !descripcionFinal) {
      Alert.alert('Faltan datos', 'Debes completar foto y descripción para actualizar.');
      return;
    }

    const form = new FormData();
    form.append('descripcion', descripcionFinal);
    form.append('servicio_id', String(servicioId));
    form.append('paso_id', String(paso));

    const fileName = fotoUriFinal.split('/').pop() || `evidencia_${servicioId}_${paso}.jpg`;
    const match = /\.(\w+)$/.exec(fileName);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    // @ts-ignore - React Native FormData file
    form.append('foto', { uri: fotoUriFinal, name: fileName, type });

    setEnviandoHito(true);
    const pasoKey = crearPasoKey(servicioId, paso);
    try {
      if (hitosCerrandoRef.current.has(pasoKey)) return;
      hitosCerrandoRef.current.add(pasoKey);

      await completarPasoApi(servicioId, paso, form);
      marcarEvidenciaPaso(servicioId, paso, {
        fotoSubida: true,
        fotoUri: fotoUriFinal,
        descripcionEscrita: true,
        descripcion: descripcionFinal,
      });

      setModalHitoVisible(false);

      limpiarEstadoHito();

      if (paso === 3) {
        await cerrarServicioDefinitivo(servicioId);
      } else {
        await cargarTab('progreso');
      }

      Alert.alert('Actualizado');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo guardar la descripción');
    } finally {
      hitosCerrandoRef.current.delete(pasoKey);
      setEnviandoHito(false);
    }
  }

  async function aceptarSeleccionados() {
    if (selectedIds.length === 0) return;

    Alert.alert('Confirmar', `¿Aceptar ${selectedIds.length} servicio(s)?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aceptar',
        style: 'default',
        onPress: async () => {
          setLoading(true);
          try {
            for (const id of selectedIds) {
              await aceptarServicioApi(id);
              // Limpiamos cualquier residuo local al aceptar para forzar sincronización limpia con Django.
              await AsyncStorage.removeItem(crearProgresoStorageKey(id));
            }

            setSelectedIds([]);
            
            // Sincronización obligatoria tras cambio de estado.
            await refreshAllTabs();

            Alert.alert('Listo', 'Servicios aceptados correctamente.');
          } catch (err: any) {
            Alert.alert('Error', err?.message || 'No se pudieron aceptar los servicios seleccionados.');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  const renderTab = useCallback((key: TabKey, label: string) => {
    const active = tab === key;
    return (
      <TouchableOpacity
        key={key}
        style={styles.tabItem}
        onLayout={(event) => {
          tabLayouts.current[key] = {
            x: event.nativeEvent.layout.x,
            width: event.nativeEvent.layout.width,
          };

          if (active) {
            indicatorX.setValue(event.nativeEvent.layout.x);
            indicatorW.setValue(event.nativeEvent.layout.width);
          }
        }}
        onPress={() => switchTab(key)}
      >
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
          {label} ({counts[key]})
        </Text>
        <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
      </TouchableOpacity>
    );
  }, [tab, counts, switchTab]);

    const isPhotoMenuOpen = menuFotoVisible;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={[styles.greeting, typography.title]}>Hola, {usuario?.username || 'Mensajero'} 👋</Text>
        <TouchableOpacity
          onPress={() => router.navigate('/profile')}
          style={styles.profileButton}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel="Abrir perfil"
        >
          <MaterialCommunityIcons name="account-circle" size={35} color="#27272A" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabsBar}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabsIndicator,
            {
              left: indicatorX,
              width: indicatorW,
            },
          ]}
        />
        {renderTab('progreso', 'En progreso')}
        {renderTab('disponibles', 'Disponibles')}
        {renderTab('terminados', 'Terminados')}
      </View>

      <Animated.View
        style={{
          flex: 1,
          opacity: fade,
          transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        }}
      >
        <FlatList
          ref={pagerRef}
          data={TAB_KEYS}
          keyExtractor={(item) => item}
          horizontal
          pagingEnabled
          snapToInterval={width}
          snapToAlignment="start"
          disableIntervalMomentum
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          bounces={false}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
            const nextTab = TAB_KEYS[nextIndex] ?? tab;
            if (nextTab !== tab) {
              setTab(nextTab);
              setSelectedIds([]);
              setExpandedId(null);
              animateTabIndicator(nextTab);
            }
          }}
          renderItem={({ item: key }) => {
            const data = key === 'progreso' ? serviciosProgreso : key === 'disponibles' ? serviciosDisponibles : serviciosTerminados;
            return (
              <View
                key={key}
                style={[
                  styles.page,
                  styles.pageCard,
                  key === 'progreso' && styles.pageProgress,
                  key === 'disponibles' && styles.pageAvailable,
                  key === 'terminados' && styles.pageDone,
                  { width },
                ]}
              >
                <FlatList
                  data={data}
                  keyExtractor={(item, index) => `${item.id}-${index}`}
                  contentContainerStyle={{ padding: 12, paddingBottom: 120 + insets.bottom }}
                  initialNumToRender={PAGE_SIZE}
                  maxToRenderPerBatch={PAGE_SIZE}
                  windowSize={5}
                  removeClippedSubviews
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing && tab === key}
                      onRefresh={async () => {
                        await refreshAllTabs();
                      }}
                    />
                  }
                  onEndReached={() => {
                    void cargarMasServicios(key);
                  }}
                  onEndReachedThreshold={0.6}
                  ListFooterComponent={tabPagination[key].loadingMore ? <ActivityIndicator color="#1d4ed8" /> : null}
                  ListEmptyComponent={<Text style={styles.emptyState}>No hay servicios en esta sección.</Text>}
                  renderItem={({ item }) => {
                    const selectable = key !== 'terminados';
                    const selected = selectedIds.includes(item.id);
                    const expanded = expandedId === item.id;
                    const isCardBusy = key === 'progreso' && (detalleVisible || modalHitoVisible || menuFotoVisible || enviandoHito);

                    return (
                      <ServiceCard
                        servicio={item}
                        selected={selected}
                        selectable={selectable}
                        expanded={expanded}
                        tab={key}
                        isCardBusy={isCardBusy}
                        estadoPaso2={getEvidenciaPaso(item, 2)}
                        estadoPaso3={getEvidenciaPaso(item, 3)}
                        onToggleSelected={() => {
                          if (key === 'terminados') return;
                          toggleSelected(item.id);
                        }}
                        onOpenDetails={() => {
                          setServicioEnDetalle(item);
                          setDetalleVisible(true);
                        }}
                        onToggleExpanded={() => setExpandedId((current) => (current === item.id ? null : item.id))}
                          onPickImage={(servicio, paso) => openPhotoMenu(servicio, paso)}
                          onOpenDescription={(servicio, paso) => openDescriptionModal(servicio, paso)}
                          onReportIssue={() => openNovedadModal(item)}
                      />
                    );
                  }}
                />
              </View>
            );
          }}
        />
        {loading && !loadedTabs[tab] ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#1d4ed8" size="large" />
          </View>
        ) : null}
      </Animated.View>

      {selectedIds.length > 0 && tab !== 'terminados' ? (
        <View
          style={[
            styles.selectionBar,
            {
              bottom: insets.bottom > 0 ? insets.bottom + 10 : 20,
            },
          ]}
        >
          <View style={styles.selectionCounterWrap}>
            <Text style={styles.selectionText}>Seleccionados:</Text>
            <View style={styles.selectionBubble}>
              <Text style={styles.selectionBubbleText}>{selectedIds.length}</Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={tab === 'disponibles' ? aceptarSeleccionados : abandonarSeleccionados}
            style={[
              styles.selectionButton,
              tab === 'disponibles' ? styles.selectionButtonAccept : styles.selectionButtonAbandon,
            ]}
          >
            <Text style={styles.selectionButtonText}>{tab === 'disponibles' ? 'Aceptar' : 'Abandonar'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={detalleVisible} transparent animationType="fade" onRequestClose={() => setDetalleVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setDetalleVisible(false)}>
          <Pressable style={styles.modalCard} onPress={() => null}>
            <Text style={styles.modalTitle}>Detalle del servicio</Text>
            {(() => {
              const motivoAbandono = servicioEnDetalle?.motivo_abandono;
              if (!motivoAbandono) return null;
              const match = motivoAbandono.match(/Servicio abandonado por (.+)\. Motivo: (.+)/);
              if (!match) return null;
              const nombre = match[1];
              const motivo = match[2];
              return (
                <View style={{ backgroundColor: '#FFF0F0', borderLeftWidth: 4, borderLeftColor: '#C8102E', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <Text style={{ color: '#9B1C1C', fontWeight: 'normal', fontSize: 15, marginBottom: 4 }}>
                     ⚠️ Novedades de abandono
                  </Text>
                  <Text style={{ color: '#9B1C1C', fontWeight: 'normal', fontSize: 13 }}>
                    Abandonado por: {nombre}
                  </Text>
                  <Text style={{ color: '#9B1C1C', fontWeight: 'normal', fontSize: 13 }}>
                    Motivo: {motivo}
                  </Text>
                </View>
              );
            })()}
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalLine}><Text style={styles.modalLabel}>Orden: </Text>{texto(servicioEnDetalle?.orden)}</Text>
              <Text style={styles.modalLine}><Text style={styles.modalLabel}>Empresa: </Text>{empresa(servicioEnDetalle)}</Text>
              <Text style={styles.modalLine}><Text style={styles.modalLabel}>Origen: </Text>{texto(servicioEnDetalle?.origen)}</Text>
              <Text style={styles.modalLine}><Text style={styles.modalLabel}>Destino: </Text>{texto(servicioEnDetalle?.destino)}</Text>
              <Text style={styles.modalLine}><Text style={styles.modalLabel}>Ciudad origen: </Text>{texto(servicioEnDetalle?.ciudad_origen)}</Text>
              <Text style={styles.modalLine}><Text style={styles.modalLabel}>Ciudad destino: </Text>{texto(servicioEnDetalle?.ciudad_destino)}</Text>
            </ScrollView>
            <TouchableOpacity onPress={() => setDetalleVisible(false)} style={styles.modalButton}>
              <Text style={styles.modalButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={modalHitoVisible} transparent={true} animationType="fade" onRequestClose={() => setModalHitoVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalHitoVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.modalTitle, { textAlign: 'center', width: '100%' }]}>RETROALIMENTACION</Text>
            <TextInput
              key={`${servicioHito?.id ?? 'none'}-${pasoHito ?? 'none'}-${modalHitoVisible ? 'open' : 'closed'}`}
              style={styles.modalInput}
              placeholder="Escribe la descripción..."
              multiline={true}
              value={descripcionHito}
              onChangeText={setDescripcionHito}
              textAlignVertical="top"
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity onPress={saveDescription} style={styles.modalPrimaryButton} activeOpacity={0.86}>
                <Text style={styles.modalPrimaryButtonText}>Actualizar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={menuFotoVisible} transparent={true} animationType="fade" onRequestClose={closePhotoMenu}>
        <Pressable style={styles.modalOverlay} onPress={closePhotoMenu}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.modalTitle, { textAlign: 'center', width: '100%' }]}>Subir Foto</Text>

            <View style={{ marginTop: 8, gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  void takePhotoFromCamera();
                }}
                activeOpacity={0.86}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  backgroundColor: '#F9FAFB',
                }}
              >
                <Text style={[styles.modalActionText, typography.label]}>Tomar Foto (Cámara)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  void pickPhotoFromGallery();
                }}
                activeOpacity={0.86}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  backgroundColor: '#F9FAFB',
                }}
              >
                <Text style={[styles.modalActionText, typography.label]}>Elegir de la Galería</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={novedadModalVisible} transparent={true} animationType="fade" onRequestClose={resetNovedadModal}>
        <Pressable style={styles.modalOverlay} onPress={resetNovedadModal}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.modalTitle, { textAlign: 'center', width: '100%' }]}>Reportar Novedad</Text>

            <View style={{ marginTop: 8, gap: 8 }}>
              {NOVEDAD_OPCIONES.map((opcion) => {
                const active = novedadSeleccionada === opcion;
                return (
                <TouchableOpacity
                key={`novedad-${opcion}`}
                    onPress={() => {
                      setNovedadSeleccionada(opcion);
                      if (opcion !== 'Otros...') setNovedadTextoOtros('');
                    }}
                    activeOpacity={0.86}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? '#111111' : '#E5E7EB',
                      backgroundColor: active ? '#111111' : '#F9FAFB',
                    }}
                  >
                    <Text style={[styles.modalOptionText, typography.label, active && styles.modalOptionTextActive]}>{opcion}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {novedadSeleccionada === 'Otros...' ? (
              <TextInput
                style={styles.modalInput}
                placeholder="Escribe detalladamente la novedad..."
                multiline={true}
                value={novedadTextoOtros}
                onChangeText={setNovedadTextoOtros}
                textAlignVertical="top"
              />
            ) : null}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity onPress={submitNovedad} style={styles.modalPrimaryButton} activeOpacity={0.86}>
                <Text style={styles.modalPrimaryButtonText}>Reportar novedad</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={modalAbandonoVisible} transparent={true} animationType="fade" onRequestClose={() => setModalAbandonoVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalAbandonoVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
            <Text style={[styles.modalTitle, { textAlign: 'center', width: '100%' }]}>Motivo de Abandono</Text>

            <View style={{ marginTop: 8, gap: 8 }}>
              {ABANDONO_OPCIONES.map((opcion) => {
                const active = motivoAbandonoSeleccionado === opcion;
                return (
                  <TouchableOpacity
                    key={`abandono-${opcion}`}
                    onPress={() => {
                      setMotivoAbandonoSeleccionado(opcion);
                      if (opcion !== 'Otro') setTextoAbandonoOtro('');
                    }}
                    activeOpacity={0.86}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: active ? '#111111' : '#E5E7EB',
                      backgroundColor: active ? '#111111' : '#F9FAFB',
                    }}
                  >
                    <Text style={[styles.modalOptionText, typography.label, active && styles.modalOptionTextActive]}>{opcion}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {motivoAbandonoSeleccionado === 'Otro' ? (
              <TextInput
                style={styles.modalInput}
                placeholder="Escribe el motivo detallado..."
                multiline={true}
                value={textoAbandonoOtro}
                onChangeText={setTextoAbandonoOtro}
                textAlignVertical="top"
              />
            ) : null}

            <View style={styles.modalActionsRow}>
              <TouchableOpacity onPress={() => setModalAbandonoVisible(false)} style={[styles.modalSecondaryButton, { marginRight: 8 }]} activeOpacity={0.86}>
                <Text style={styles.modalSecondaryButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarAbandono} style={styles.modalPrimaryButton} activeOpacity={0.86}>
                <Text style={styles.modalPrimaryButtonText}>Confirmar Abandono</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9F9F9' },
  header: {
    paddingTop: 46,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: { fontSize: 20, color: '#111111' },
    profileButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F3F4F6',
      borderWidth: 1,
      borderColor: '#E5E7EB',
    },
  tabsBar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb', position: 'relative' },
  tabsIndicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  tabItem: { flex: 1, alignItems: 'center', paddingTop: 10, paddingBottom: 12, zIndex: 1 },
  tabLabel: { fontSize: 13, color: '#5f6368' },
  tabLabelActive: { color: '#111111' },
  tabUnderline: { marginTop: 10, width: 52, height: 4, borderRadius: 999, backgroundColor: 'transparent' },
  tabUnderlineActive: { backgroundColor: '#E53935' },
  page: { flex: 1 },
  pageCard: {
    paddingTop: 8,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  pageProgress: { backgroundColor: '#F9F9F9' },
  pageAvailable: { backgroundColor: '#F9F9F9' },
  pageDone: { backgroundColor: '#F9F9F9' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 245, 247, 0.7)',
  },
  emptyState: { paddingTop: 24, textAlign: 'center', color: '#6b7280' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECECEC',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    position: 'relative',
    overflow: 'hidden',
  },
  cardPressed: {
    transform: [{ scale: 0.995 }],
    shadowOpacity: 0.1,
  },
  cardSelected: { backgroundColor: '#FFF7F7', borderColor: '#E53935' },
  cardSelectedDisponible: { backgroundColor: '#EEF8EE', borderColor: '#66BB6A' },
  cardSelectedProgreso: { borderColor: '#E53935' },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  cardTitle: { fontSize: 18, color: '#111827', marginBottom: 8 },
  priorityWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  priorityText: { color: '#E53935', fontSize: 12, fontWeight: '900', borderWidth: 1, borderColor: '#E53935', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  priorityIcon: { color: '#E53935', fontSize: 18, marginTop: -2 },
  cardBodyGrid: { flexDirection: 'row', alignItems: 'flex-start' },
  infoColumn: { flex: 1 },
  infoDividerVertical: { width: 1, backgroundColor: '#d6d8de', marginHorizontal: 10, alignSelf: 'stretch' },
  infoLine: { marginBottom: 5, lineHeight: 15 },
  infoLabelInline: { fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-Medium', color: '#27272A', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  infoValueInline: { fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light', color: '#52525B', fontSize: 13, fontWeight: '400' },
  infoValueInlineBold: { fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light', color: '#52525B', fontSize: 13, fontWeight: '400' },
  infoAddress: { fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light', color: '#52525B', fontSize: 13, fontWeight: '400', lineHeight: 14, marginTop: 2, marginBottom: 4 },
  infoAddressLabel: { fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-Medium', color: '#27272A', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
cardFooter: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#F3F4F6',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 12,  
    borderBottomRightRadius: 12, 
  },
  footerActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  detailsButton: { borderColor: '#111111', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  detailsButtonText: { color: '#111111', fontSize: 12 },
  routeButton: { borderColor: '#E53935', borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  routeButtonText: { color: '#E53935', fontSize: 12 },
  chevronButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chevronText: { color: '#111111', fontSize: 24, marginTop: -2 },
  timelineWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, backgroundColor: '#fff', position: 'relative' },
  timelineBody: { flexDirection: 'row', position: 'relative', alignItems: 'flex-start' },
  lineConnector: { position: 'absolute', left: 14, top: 10, bottom: 10, width: 2, backgroundColor: '#D1D5DB', borderRadius: 999 },
  lineConnectorProgress: { position: 'absolute', left: 14, top: 10, width: 2, backgroundColor: '#EF4444', borderRadius: 999 },
  lineConnectorProgressZero: { height: 0 },
  lineConnectorProgressMid: { height: '50%' },
  lineConnectorProgressFull: { height: '100%' },
  timelineRailColumn: { width: 30, alignItems: 'center', position: 'relative', paddingTop: 4, paddingBottom: 2, flexShrink: 0 },
  leftColumn: { width: 30, justifyContent: 'flex-start', alignItems: 'center', flexShrink: 0, paddingTop: 4 },
  timelineRailBase: { position: 'absolute', left: 14, top: 10, bottom: 10, width: 2, backgroundColor: '#D1D5DB', borderRadius: 999 },
  timelineRailProgress: { position: 'absolute', left: 14, top: 10, width: 2, backgroundColor: '#EF4444', borderRadius: 999 },
  timelineRailProgressZero: { height: 0 },
  timelineRailProgressMid: { height: '50%' },
  timelineRailProgressFull: { height: '100%' },
  timelineRailDotTop: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', marginTop: 4, zIndex: 2, borderWidth: 2, borderColor: '#fff' },
  timelineRailDotMiddle: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#D1D5DB', marginTop: 4, zIndex: 2, borderWidth: 2, borderColor: '#fff' },
  timelineRailDotBottom: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#D1D5DB', marginTop: 4, zIndex: 2, borderWidth: 2, borderColor: '#fff' },
  timelineRailDotActive: { backgroundColor: '#EF4444' },
  timelineStagesColumn: { flex: 1, marginLeft: 12 },
  timelineRow: { position: 'relative', paddingLeft: 8 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  timelineContent: { flex: 1, paddingBottom: 2 },
  timelineTitle: { fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : 'HelveticaNeue-Medium', fontSize: 13, fontWeight: '600', color: '#27272A', marginBottom: 4, letterSpacing: 0.3 },
  timelineText: { fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light', fontSize: 13, color: '#52525B', fontWeight: '400', marginBottom: 4 },
  timelineMeta: { fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light', fontSize: 13, color: '#52525B', fontWeight: '400', marginTop: 2 },
  timelineControlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, marginTop: 8 },
  timelineActionsGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  timelineCheckBox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.6, borderColor: '#9ca3af', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  timelineCheckBoxDone: { borderColor: '#EF4444', backgroundColor: '#EF4444' },
  timelineCheckText: { color: '#fff', fontSize: 12, marginTop: -1 },
  timelineActionButton: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#dbe3ef', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f8fafc' },
  timelineActionButtonDone: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  timelineActionButtonDisabled: { opacity: 0.55 },
  timelineActionIcon: { color: '#6b7280' },
  evidenceSuccessIcon: { color: '#EF4444' },
  timelineActionText: { fontSize: 11, color: '#6b7280' },
  evidenceSuccessText: { color: '#EF4444' },
  statusCheckbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.6, borderColor: '#9ca3af', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  statusCheckboxCompleted: { borderColor: '#EF4444', backgroundColor: '#EF4444' },
  reportButton: { alignSelf: 'center', marginTop: 20, marginBottom: 10, backgroundColor: '#fff', borderRadius: 999, borderWidth: 1, borderColor: '#111111', paddingHorizontal: 16, paddingVertical: 8 },
  reportButtonText: { color: '#111111', fontSize: 12 },
  selectionBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  selectionCounterWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectionText: { fontSize: 13, color: '#374151' },
  selectionBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionBubbleText: { color: '#fff', fontSize: 12 },
  selectionButton: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  selectionButtonAccept: { backgroundColor: '#10B981' },
  selectionButtonAbandon: { backgroundColor: '#E53935' },
  selectionButtonText: { color: '#fff', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 16, maxHeight: '80%' },
  modalTitle: { fontSize: 18, color: '#111827', marginBottom: 12 },
  modalLine: { fontSize: 14, lineHeight: 20, color: '#334155', marginBottom: 6 },
  modalLabel: { color: '#111827' },
  modalButton: { alignSelf: 'center', marginTop: 8, backgroundColor: '#1d4ed8', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  modalButtonText: { color: '#fff' },
  modalInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, height: 100, backgroundColor: '#fff', fontSize: 14, color: '#111827' },
  modalActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  modalPrimaryButton: { flex: 1, backgroundColor: '#111', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  modalPrimaryButtonText: { color: '#fff', fontSize: 13 },
  modalSecondaryButton: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  modalSecondaryButtonText: { color: '#111827', fontSize: 13 },
  modalActionText: { color: '#111827', fontSize: 13 },
  modalOptionText: { color: '#111827', fontSize: 13 },
  modalOptionTextActive: { color: '#FFFFFF' },
  abandonoAlertText: { color: '#DC2626', fontSize: 13, fontWeight: '600', marginBottom: 12, padding: 10, backgroundColor: '#FEF2F2', borderRadius: 8 },
});
