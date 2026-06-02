import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme/typography';
import { getServiciosApi } from '../../services/api';

type DayActivity = {
  dateKey: string;
  dayLabel: string;
  dayNumber: string;
  km: number;
  servicios: number;
};

type RangeMetrics = {
  kilometros: number;
  servicios: number;
};

type ServicioPerfil = {
  estado?: string;
  status?: string;
  fecha?: string | null;
  fecha_creacion?: string | null;
  created_at?: string | null;
  kilometros?: number | string | null;
  mensajero?: { id?: number | string | null } | null;
  mensajero_id?: number | string | null;
};

type RangoConfiabilidad = {
  nombre: string;
  icono: string;
};

const missions = [
  { title: 'Meta del Día', detail: 'Completar 20 servicios', target: 20 },
  { title: 'Logro Mensual', detail: 'Élite 250 servicios', target: 250 },
];

function pad(number: number) {
  return String(number).padStart(2, '0');
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function normalizarLista(data: any) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function normalizarEstadoServicio(servicio: ServicioPerfil) {
  return String(servicio?.estado ?? servicio?.status ?? '').trim().toLowerCase();
}

function obtenerFechaServicio(servicio: ServicioPerfil) {
  const valor = servicio?.fecha ?? servicio?.fecha_creacion ?? servicio?.created_at ?? null;
  if (!valor) return null;

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha;
}

function obtenerKilometrosServicio(servicio: ServicioPerfil) {
  const valor = Number(servicio?.kilometros ?? 0);
  return Number.isFinite(valor) ? valor : 0;
}

function mensajeroId(servicio: ServicioPerfil) {
  return servicio?.mensajero?.id || servicio?.mensajero_id || null;
}

function obtenerMetricasFiltradas(servicios: ServicioPerfil[], fechaInicio: string, fechaFin: string): RangeMetrics {
  const inicio = fechaInicio <= fechaFin ? fechaInicio : fechaFin;
  const fin = fechaInicio <= fechaFin ? fechaFin : fechaInicio;
  const inicial = { kilometros: 0, servicios: 0 };

  return servicios.reduce<RangeMetrics>(
    (acumulador, servicio) => {
      if (normalizarEstadoServicio(servicio) !== 'terminado') return acumulador;

      const fechaServicio = obtenerFechaServicio(servicio);
      if (!fechaServicio) return acumulador;

      const fechaKey = toKey(fechaServicio);
      if (fechaKey < inicio || fechaKey > fin) return acumulador;

      return {
        kilometros: acumulador.kilometros + obtenerKilometrosServicio(servicio),
        servicios: acumulador.servicios + 1,
      };
    },
    inicial,
  );
}

function obtenerRangoConfiabilidad(totalServicios: number, efectividad: number): RangoConfiabilidad {
  if (totalServicios < 30) {
    return { nombre: 'Piloto Novato', icono: '🚚' };
  }

  if (totalServicios >= 30 && totalServicios < 100 && efectividad > 90) {
    return { nombre: 'Piloto Verificado', icono: '✅' };
  }

  if (totalServicios >= 100 && totalServicios < 250 && efectividad > 95) {
    return { nombre: 'Piloto Élite', icono: '�' };
  }

  if (totalServicios >= 250 && efectividad > 98) {
    return { nombre: 'Piloto Diamante', icono: '💎' };
  }

  if (totalServicios >= 250) {
    return { nombre: 'Piloto Élite', icono: '🔥' };
  }

  if (totalServicios >= 100) {
    return { nombre: 'Piloto Verificado', icono: '✅' };
  }

  return { nombre: 'Piloto Novato', icono: '�' };
}

function addDays(date: Date, offset: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate;
}

function startOfWeek(date: Date) {
  const day = (date.getDay() + 6) % 7;
  return addDays(date, -day);
}

function buildWeekDays(weekStart: Date) {
  const labels = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(weekStart, index);
    return {
      date,
      dateKey: toKey(date),
      dayLabel: labels[index],
      dayNumber: pad(date.getDate()),
    };
  });
}

function formatKm(value: number) {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Km`;
}

function formatServices(value: number) {
  return `${value.toLocaleString('en-US')} servicios`;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { usuario, logout } = useAuth();
  const router = useRouter();
  const today = new Date();
  const todayKey = toKey(today);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [selectionStart, setSelectionStart] = useState(todayKey);
  const [selectionEnd, setSelectionEnd] = useState<string | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [serviciosHistorial, setServiciosHistorial] = useState<ServicioPerfil[]>([]);

  const topPadding = useMemo(() => insets.top + 16, [insets.top]);
  const bottomPadding = useMemo(() => insets.bottom + 40, [insets.bottom]);
  const levelProgress = 0.72;
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const rangoConfiabilidad = useMemo(
    () => obtenerRangoConfiabilidad(serviciosHistorial.length, serviciosHistorial.length > 0 ? 100 : 0),
    [serviciosHistorial.length],
  );

  useEffect(() => {
    let isMounted = true;

    const fetchServiciosCerrados = async () => {
      try {
        setIsLoadingMetrics(true);

        if (!usuario?.id) {
          if (isMounted) setServiciosHistorial([]);
          return;
        }

        const response = await getServiciosApi('terminado');
        const lista = normalizarLista(response?.data)
          .filter((servicio: ServicioPerfil) => mensajeroId(servicio) === usuario.id)
          .filter((servicio: ServicioPerfil) => normalizarEstadoServicio(servicio) === 'terminado');

        if (!isMounted) return;

        setServiciosHistorial(lista);
      } catch {
        if (!isMounted) return;
        setServiciosHistorial([]);
      } finally {
        if (isMounted) setIsLoadingMetrics(false);
      }
    };

    void fetchServiciosCerrados();

    return () => {
      isMounted = false;
    };
  }, [usuario?.id]);

  useEffect(() => {
    const isSelectedInsideWeek = weekDays.some((day) => day.dateKey === selectionStart || day.dateKey === selectionEnd);
    if (!isSelectedInsideWeek) {
      setSelectionStart(weekDays[0]?.dateKey ?? todayKey);
      setSelectionEnd(null);
    }
  }, [weekDays, selectionStart, selectionEnd, todayKey]);

  const weeklyTotals = useMemo(() => {
    return weekDays.reduce(
      (accumulator, day) => {
        const dayData = obtenerMetricasFiltradas(serviciosHistorial, day.dateKey, day.dateKey);
        return {
          km: accumulator.km + dayData.kilometros,
          servicios: accumulator.servicios + dayData.servicios,
        };
      },
      { km: 0, servicios: 0 },
    );
  }, [weekDays, serviciosHistorial]);

  const maxKm = useMemo(() => {
    const values = weekDays.map((day) => obtenerMetricasFiltradas(serviciosHistorial, day.dateKey, day.dateKey).kilometros);
    const maxValue = Math.max(...values, 0);
    return maxValue === 0 ? 1 : maxValue;
  }, [weekDays, serviciosHistorial]);

  const goPreviousWeek = () => {
    setWeekStart((current) => addDays(current, -7));
  };

  const goNextWeek = () => {
    setWeekStart((current) => addDays(current, 7));
  };

  const selectedMetrics = useMemo(
    () => obtenerMetricasFiltradas(serviciosHistorial, selectionStart, selectionEnd ?? selectionStart),
    [serviciosHistorial, selectionStart, selectionEnd],
  );

  const dailyServices = useMemo(
    () => obtenerMetricasFiltradas(serviciosHistorial, todayKey, todayKey).servicios,
    [serviciosHistorial, todayKey],
  );

  const monthlyServices = useMemo(() => {
    const todayDate = new Date();
    const monthStartDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
    return obtenerMetricasFiltradas(serviciosHistorial, toKey(monthStartDate), todayKey).servicios;
  }, [serviciosHistorial, todayKey]);

  const dailyProgress = Math.min(1, dailyServices / missions[0].target);
  const monthlyProgress = Math.min(1, monthlyServices / missions[1].target);

  const selectedRangeLabel = useMemo(() => {
    const start = fromKey(selectionStart);
    const end = fromKey(selectionEnd ?? selectionStart);
    const first = start <= end ? start : end;
    const last = start <= end ? end : start;

    if (toKey(first) === toKey(last)) {
      return first.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: '2-digit',
        month: 'short',
      });
    }

    const startLabel = first.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
    const endLabel = last.toLocaleDateString('es-ES', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
    return `${startLabel} - ${endLabel}`;
  }, [selectionStart, selectionEnd]);

  const buildIsInRange = (dateKey: string) => {
    if (!selectionEnd || selectionStart === selectionEnd) return false;
    const start = fromKey(selectionStart);
    const end = fromKey(selectionEnd);
    const first = start <= end ? start : end;
    const last = start <= end ? end : start;
    const current = fromKey(dateKey);
    return current > first && current < last;
  };

  const handleSelectDay = (dateKey: string) => {
    if (!selectionEnd) {
      if (dateKey === selectionStart) {
        setSelectionEnd(null);
        return;
      }

      if (compareDateKeys(dateKey, selectionStart) > 0) {
        setSelectionEnd(dateKey);
        return;
      }

      setSelectionStart(dateKey);
      setSelectionEnd(null);
      return;
    }

    setSelectionStart(dateKey);
    setSelectionEnd(null);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.82}>
          <Ionicons name="chevron-back" size={20} color="#111827" />
        </TouchableOpacity>
        <View style={styles.avatarWrap}>
          <MaterialCommunityIcons name="account-circle" size={78} color="#27272A" />
        </View>
        <Text style={[styles.title, typography.title]}>Valentina</Text>
        <Text style={[styles.rankText, styles.lightText]}>{`${rangoConfiabilidad.nombre} ${rangoConfiabilidad.icono}`}</Text>

        <View style={styles.levelBarWrap}>
          <View style={styles.levelBarTrack}>
            <View style={[styles.levelBarFill, { width: `${levelProgress * 100}%` }]} />
          </View>
          <View style={styles.levelBarMetaRow}>
            <Text style={[styles.levelBarMeta, styles.lightText]}>XP 7,240 / 10,000</Text>
            <Text style={[styles.levelBarMeta, styles.lightText]}>72%</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.weekCard}>
          <View style={styles.weekHeaderRow}>
            <TouchableOpacity onPress={goPreviousWeek} activeOpacity={0.82} style={styles.weekArrowButton}>
              <Ionicons name="chevron-back" size={18} color="#374151" />
            </TouchableOpacity>

            <View style={styles.weekTitleWrap}>
              <Text style={[styles.weekTitle, styles.lightText]}>Semana actual</Text>
              <Text style={styles.weekSubtitle}>Selecciona un día para ver su rendimiento</Text>
            </View>

            <TouchableOpacity onPress={goNextWeek} activeOpacity={0.82} style={styles.weekArrowButton}>
              <Ionicons name="chevron-forward" size={18} color="#374151" />
            </TouchableOpacity>
          </View>

          <FlatList
            horizontal
            data={weekDays}
            keyExtractor={(item) => item.dateKey}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.weekDaysRow}
            initialNumToRender={7}
            maxToRenderPerBatch={7}
            renderItem={({ item: day }) => {
              const active = day.dateKey === selectionStart || day.dateKey === selectionEnd;
              const inRange = buildIsInRange(day.dateKey);
              return (
                <TouchableOpacity
                  activeOpacity={0.86}
                  onPress={() => handleSelectDay(day.dateKey)}
                  style={[styles.weekDayPill, inRange && styles.weekDayPillRange, active && styles.weekDayPillActive]}
                >
                  <Text style={[styles.weekDayLabel, active && styles.weekDayLabelActive]}>{day.dayLabel}</Text>
                  <Text style={[styles.weekDayNumber, active && styles.weekDayNumberActive]}>{day.dayNumber}</Text>
                </TouchableOpacity>
              );
            }}
          />

          <View style={styles.selectionRow}>
            <Text style={[styles.selectionLabel, styles.lightText]}>Periodo activo</Text>
            <Text style={[styles.selectionValue, styles.lightText]}>{selectedRangeLabel}</Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <MaterialCommunityIcons name="map-marker-distance" size={18} color="#27272A" />
            </View>
            <Text style={[styles.metricValue, styles.metricValueLight]}>{formatKm(selectedMetrics.kilometros)}</Text>
            <Text style={[styles.metricLabel, styles.metricLabelCompact]}>Kilómetros Rodados</Text>
          </View>

          <View style={styles.metricCard}>
            <View style={styles.metricIconWrap}>
              <MaterialCommunityIcons name="clipboard-list-outline" size={18} color="#27272A" />
            </View>
            <Text style={[styles.metricValue, styles.metricValueLight]}>{formatServices(selectedMetrics.servicios)}</Text>
            <Text style={[styles.metricLabel, styles.metricLabelCompact]}>Conteo de Servicios</Text>
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, typography.title]}>Rendimiento semanal</Text>
            {isLoadingMetrics ? <ActivityIndicator size="small" color="#6B7280" /> : null}
          </View>

          <View style={styles.barRow}>
            {weekDays.map((day) => {
              const dayData = obtenerMetricasFiltradas(serviciosHistorial, day.dateKey, day.dateKey);
              const hasActivity = dayData.kilometros > 0 || dayData.servicios > 0;
              const barHeight = hasActivity ? Math.max(16, (dayData.kilometros / maxKm) * 110) : 8;
              const selected = day.dateKey === selectionStart || day.dateKey === selectionEnd;

              return (
                <View key={`bar-${day.dateKey}`} style={styles.barItem}>
                  <View style={[styles.barTrack, !hasActivity && styles.barTrackEmpty, selected && styles.barTrackSelected]}>
                    {hasActivity ? (
                      <View style={[styles.barFill, { height: barHeight }]} />
                    ) : (
                      <Text style={styles.emptyBarLabel}>Vacio</Text>
                    )}
                  </View>
                  <Text style={[styles.barDayLabel, selected && styles.barDayLabelSelected]}>{day.dayLabel}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.streakRow}>
          <View style={styles.streakChip}>
            <MaterialCommunityIcons name="flash" size={16} color="#27272A" />
            <Text style={styles.streakChipText}>{`${weeklyTotals.servicios} servicios esta semana`}</Text>
          </View>
          <View style={styles.streakChip}>
            <MaterialCommunityIcons name="shield-star-outline" size={16} color="#27272A" />
            <Text style={styles.streakChipText}>Confiabilidad premium</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.missionsHeaderRow}>
            <Text style={[styles.sectionTitle, typography.title]}>Retos de rendimiento</Text>
            {isLoadingMetrics ? <ActivityIndicator size="small" color="#6B7280" /> : null}
          </View>

          <View style={styles.missionsList}>
            <View style={styles.missionCard}>
              <View style={styles.missionHeaderRow}>
                <View style={styles.missionHeaderTextWrap}>
                  <Text style={styles.missionTitle}>{missions[0].title}</Text>
                  <Text style={styles.missionDetail}>{missions[0].detail}</Text>
                </View>
                <Text style={styles.missionPercent}>{`${dailyServices} / ${missions[0].target} servicios`}</Text>
              </View>
              <View style={styles.missionTrack}>
                <View style={[styles.missionFill, { width: `${dailyProgress * 100}%` }]} />
              </View>
            </View>

            <View style={styles.missionCard}>
              <View style={styles.missionHeaderRow}>
                <View style={styles.missionHeaderTextWrap}>
                  <Text style={styles.missionTitle}>{missions[1].title}</Text>
                  <Text style={styles.missionDetail}>{missions[1].detail}</Text>
                </View>
                <Text style={styles.missionPercent}>{`${monthlyServices} / ${missions[1].target} servicios`}</Text>
              </View>
              <View style={styles.missionTrack}>
                <View style={[styles.missionFill, { width: `${monthlyProgress * 100}%` }]} />
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => {
            void logout();
            router.replace('/');
          }}
          activeOpacity={0.86}
          style={styles.logoutButton}
        >
          <Ionicons name="log-out-outline" size={18} color="#6B7280" />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    position: 'absolute',
    left: 16,
    top: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  title: { fontSize: 22, color: '#111827' },
  rankText: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 15,
    color: '#8B5CF6',
    textAlign: 'center',
    fontWeight: '400',
  },
  lightText: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400',
  },
  levelBarWrap: { width: '100%', marginTop: 4, gap: 6 },
  levelBarTrack: { height: 10, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  levelBarFill: { height: '100%', borderRadius: 999, backgroundColor: '#111827' },
  levelBarMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelBarMeta: {
    fontSize: 12,
    color: '#6B7280',
  },
  content: { padding: 16, gap: 14 },
  weekCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  weekHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  weekArrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  weekTitleWrap: { flex: 1, alignItems: 'center' },
  weekTitle: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 16,
    color: '#111827',
    fontWeight: '400',
    textAlign: 'center',
  },
  weekSubtitle: {
    marginTop: 2,
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '400',
    textAlign: 'center',
  },
  weekDaysRow: {
    gap: 8,
    paddingRight: 4,
  },
  weekDayPill: {
    width: 58,
    minHeight: 74,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  weekDayPillActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  weekDayPillRange: {
    backgroundColor: '#E5E7EB',
    borderColor: '#CBD5E1',
  },
  weekDayLabel: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '400',
  },
  weekDayLabelActive: { color: '#FFFFFF' },
  weekDayNumber: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 20,
    color: '#111827',
    fontWeight: '400',
  },
  weekDayNumberActive: { color: '#FFFFFF' },
  selectionRow: {
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 2,
  },
  selectionLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  selectionValue: {
    fontSize: 13,
    color: '#111827',
  },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    gap: 8,
  },
  metricIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 22,
    color: '#111827',
    fontWeight: '400',
  },
  metricValueLight: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontWeight: '400',
  },
  metricLabel: { fontSize: 12, color: '#6B7280', textAlign: 'center' },
  metricLabelCompact: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    color: '#27272A',
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chartTitle: { fontSize: 15, color: '#111827' },
  barRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 150,
    gap: 6,
  },
  barItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  barTrack: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'flex-end',
    alignItems: 'center',
    overflow: 'hidden',
    paddingBottom: 6,
  },
  barTrackSelected: {
    borderColor: '#27272A',
  },
  barTrackEmpty: {
    backgroundColor: '#F3F4F6',
  },
  barFill: {
    width: '72%',
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  emptyBarLabel: {
    transform: [{ rotate: '-90deg' }],
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '400',
  },
  barDayLabel: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '400',
  },
  barDayLabelSelected: {
    color: '#111827',
  },
  streakRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  streakChipText: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 12,
    color: '#374151',
    fontWeight: '400',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  missionsHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, color: '#111827' },
  missionsList: { gap: 12 },
  missionCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  missionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  missionHeaderTextWrap: { flex: 1, gap: 2 },
  missionTitle: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 13,
    color: '#111827',
    fontWeight: '400',
  },
  missionDetail: {
    marginTop: 2,
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '400',
  },
  missionPercent: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 12,
    color: '#111827',
    fontWeight: '400',
  },
  missionTrack: { height: 10, borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  missionFill: { height: '100%', borderRadius: 999, backgroundColor: '#111827' },
  logoutButton: {
    marginTop: 6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  logoutText: {
    fontFamily: Platform.OS === 'android' ? 'sans-serif-light' : 'HelveticaNeue-Light',
    fontSize: 13,
    color: '#374151',
    fontWeight: '400',
  },
});

function compareDateKeys(firstKey: string, secondKey: string) {
  return firstKey.localeCompare(secondKey);
}