import { Fragment } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Line, Rect, Text as SvgText, Path } from 'react-native-svg';

type MapValue = string | number | null | undefined;

export type MiniMapInput = {
  origenLat?: MapValue;
  origenLng?: MapValue;
  destinoLat?: MapValue;
  destinoLng?: MapValue;
  mensajeroLat?: MapValue;
  mensajeroLng?: MapValue;
  height?: number;
};

type Point = {
  x: number;
  y: number;
  label: string;
  color: string;
  kind: 'origen' | 'mensajero' | 'destino';
};

function normalizeCoordinate(value: MapValue) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointOrNull(lat: MapValue, lng: MapValue, label: string, color: string) {
  const parsedLat = normalizeCoordinate(lat);
  const parsedLng = normalizeCoordinate(lng);

  if (parsedLat === null || parsedLng === null) {
    return null;
  }

  const kind = label === 'Origen' ? 'origen' : label === 'Destino' ? 'destino' : 'mensajero';
  return { lat: parsedLat, lng: parsedLng, label, color, kind };
}

function projectPoints(input: MiniMapInput) {
  const route = [
    pointOrNull(input.origenLat, input.origenLng, 'Origen', '#2563eb'),
    pointOrNull(input.mensajeroLat, input.mensajeroLng, 'Mensajero', '#f59e0b'),
    pointOrNull(input.destinoLat, input.destinoLng, 'Destino', '#16a34a'),
  ].filter(Boolean) as Array<{ lat: number; lng: number; label: string; color: string; kind: 'origen' | 'mensajero' | 'destino' }>;

  if (!route.length) {
    return { markers: [], route: [] as Point[], hasData: false };
  }

  const latitudes = route.map((point) => point.lat);
  const longitudes = route.map((point) => point.lng);
  const latPadding = Math.max((Math.max(...latitudes) - Math.min(...latitudes)) * 0.2, 0.01);
  const lngPadding = Math.max((Math.max(...longitudes) - Math.min(...longitudes)) * 0.2, 0.01);

  const minLat = Math.min(...latitudes) - latPadding;
  const maxLat = Math.max(...latitudes) + latPadding;
  const minLng = Math.min(...longitudes) - lngPadding;
  const maxLng = Math.max(...longitudes) + lngPadding;

  const markers = route.map((point) => {
    const x = ((point.lng - minLng) / (maxLng - minLng)) * 100;
    const y = 100 - ((point.lat - minLat) / (maxLat - minLat)) * 100;
    return { x, y, label: point.label, color: point.color, kind: point.kind };
  });

  return { markers, route: markers, hasData: true };
}

function LineSegment({ start, end }: { start: Point; end: Point }) {
  return <Line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#64748b" strokeWidth="2" strokeDasharray="4,4" opacity="0.85" />;
}

function Pin({ x, y, color }: { x: number; y: number; color: string }) {
  const topY = y - 4.2;
  const bottomY = y + 4.2;
  const pinPath = `M ${x} ${bottomY} C ${x + 3.2} ${y + 1.4}, ${x + 3.2} ${topY}, ${x} ${topY} C ${x - 3.2} ${topY}, ${x - 3.2} ${y + 1.4}, ${x} ${bottomY} Z`;

  return (
    <>
      <Path d={pinPath} fill={color} stroke="#ffffff" strokeWidth="1" />
      <Circle cx={x} cy={y - 1.3} r="1.2" fill="#ffffff" />
    </>
  );
}

function CourierBadge({ x, y }: { x: number; y: number }) {
  const bubbleX = Math.max(4, Math.min(70, x + 3.5));
  const bubbleY = Math.max(10, Math.min(84, y - 7));

  return (
    <>
      <Rect x={bubbleX} y={bubbleY} width="24" height="8" rx="4" fill="#ffffff" stroke="#f1f5f9" strokeWidth="0.6" />
      <SvgText x={bubbleX + 2.8} y={bubbleY + 5.4} fontSize="3.7" fill="#0f172a" fontWeight="700">
        Mensajero
      </SvgText>
    </>
  );
}

export function MiniMap(input: MiniMapInput) {
  const height = input.height ?? 220;
  const { markers, route, hasData } = projectPoints(input);
  const courierMarker = markers.find((marker) => marker.kind === 'mensajero');

  return (
    <View style={[styles.container, { height }]}>
      {!hasData ? (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Todavía no hay coordenadas para mostrar el mapa.</Text>
        </View>
      ) : (
        <>
          <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            {/* Fondo estilo app delivery, local y sin depender de servicios externos. */}
            <Rect x="0" y="0" width="100" height="100" rx="14" fill="#edf4ff" />
            <Rect x="-10" y="20" width="120" height="12" fill="#e2ebf8" opacity="0.9" />
            <Rect x="-10" y="56" width="120" height="9" fill="#e2ebf8" opacity="0.75" />

            <Line x1="8" y1="18" x2="92" y2="18" stroke="#d2deef" strokeWidth="0.8" />
            <Line x1="8" y1="38" x2="92" y2="38" stroke="#d2deef" strokeWidth="0.8" />
            <Line x1="8" y1="58" x2="92" y2="58" stroke="#d2deef" strokeWidth="0.8" />
            <Line x1="8" y1="78" x2="92" y2="78" stroke="#d2deef" strokeWidth="0.8" />
            <Line x1="20" y1="8" x2="20" y2="92" stroke="#d2deef" strokeWidth="0.8" />
            <Line x1="40" y1="8" x2="40" y2="92" stroke="#d2deef" strokeWidth="0.8" />
            <Line x1="60" y1="8" x2="60" y2="92" stroke="#d2deef" strokeWidth="0.8" />
            <Line x1="80" y1="8" x2="80" y2="92" stroke="#d2deef" strokeWidth="0.8" />

            {route.length > 1 && <LineSegment start={route[0]} end={route[route.length - 1]} />}
            {route.length > 2 && <LineSegment start={route[0]} end={route[1]} />}
            {route.length > 2 && <LineSegment start={route[1]} end={route[2]} />}

            {markers.map((marker) => marker.kind === 'mensajero' ? (
              <Fragment key={marker.label}>
                <Circle cx={marker.x} cy={marker.y} r="4.3" fill={marker.color} stroke="#ffffff" strokeWidth="1.8" />
                <SvgText
                  x={marker.x}
                  y={marker.y + 1.5}
                  fontSize="4.2"
                  textAnchor="middle"
                >
                  🛵
                </SvgText>
              </Fragment>
            ) : (
              <Pin key={marker.label} x={marker.x} y={marker.y} color={marker.color} />
            ))}

            {courierMarker && (
              <CourierBadge
                x={courierMarker.x}
                y={courierMarker.y}
              />
            )}

            <Rect x="4" y="4" width="34" height="8" rx="4" fill="#ffffff" opacity="0.95" />
            <SvgText x="6.7" y="9.4" fontSize="3.8" fill="#0f172a" fontWeight="700">
              En camino al destino
            </SvgText>
          </Svg>

          <View style={styles.legend}>
            {markers.map((marker, index) => (
              <View key={`marker-${index}`} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: marker.color }]} />
                <Text style={styles.legendText}>{marker.kind === 'mensajero' ? '🛵 Mensajero' : marker.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f8fafc',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  fallbackText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
  },
  legend: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
});