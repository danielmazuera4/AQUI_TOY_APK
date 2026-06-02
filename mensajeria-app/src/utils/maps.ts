type MapValue = string | number | null | undefined;

function normalizeCoordinate(value: MapValue) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildRouteUrl(
  origenLat: MapValue,
  origenLng: MapValue,
  destinoLat: MapValue,
  destinoLng: MapValue,
  origenTexto?: string,
  destinoTexto?: string,
) {
  const parsedOrigenLat = normalizeCoordinate(origenLat);
  const parsedOrigenLng = normalizeCoordinate(origenLng);
  const parsedDestinoLat = normalizeCoordinate(destinoLat);
  const parsedDestinoLng = normalizeCoordinate(destinoLng);

  if (
    parsedOrigenLat !== null &&
    parsedOrigenLng !== null &&
    parsedDestinoLat !== null &&
    parsedDestinoLng !== null
  ) {
    return `https://www.google.com/maps/dir/?api=1&origin=${parsedOrigenLat},${parsedOrigenLng}&destination=${parsedDestinoLat},${parsedDestinoLng}&travelmode=driving`;
  }

  const originQuery = encodeURIComponent(origenTexto ?? '');
  const destinationQuery = encodeURIComponent(destinoTexto ?? '');
  return `https://www.google.com/maps/dir/?api=1&origin=${originQuery}&destination=${destinationQuery}&travelmode=driving`;
}

export function hasRouteCoordinates(
  origenLat: MapValue,
  origenLng: MapValue,
  destinoLat: MapValue,
  destinoLng: MapValue,
) {
  return (
    normalizeCoordinate(origenLat) !== null &&
    normalizeCoordinate(origenLng) !== null &&
    normalizeCoordinate(destinoLat) !== null &&
    normalizeCoordinate(destinoLng) !== null
  );
}

export function buildEmbeddedMapUrl(
  origenLat: MapValue,
  origenLng: MapValue,
  destinoLat: MapValue,
  destinoLng: MapValue,
  mensajeroLat?: MapValue,
  mensajeroLng?: MapValue,
  origenTexto?: string,
  destinoTexto?: string,
) {
  const parsedOrigenLat = normalizeCoordinate(origenLat);
  const parsedOrigenLng = normalizeCoordinate(origenLng);
  const parsedDestinoLat = normalizeCoordinate(destinoLat);
  const parsedDestinoLng = normalizeCoordinate(destinoLng);
  const parsedMensajeroLat = normalizeCoordinate(mensajeroLat);
  const parsedMensajeroLng = normalizeCoordinate(mensajeroLng);

  const hasOrigin = parsedOrigenLat !== null && parsedOrigenLng !== null;
  const hasDestination = parsedDestinoLat !== null && parsedDestinoLng !== null;
  const hasCourier = parsedMensajeroLat !== null && parsedMensajeroLng !== null;

  const formatPoint = (lat: number, lng: number) => `${lat},${lng}`;

  const routeFrom = hasCourier
    ? formatPoint(parsedMensajeroLat, parsedMensajeroLng)
    : hasOrigin
      ? formatPoint(parsedOrigenLat, parsedOrigenLng)
      : null;
  const routeTo = hasDestination
    ? formatPoint(parsedDestinoLat, parsedDestinoLng)
    : hasOrigin
      ? formatPoint(parsedOrigenLat, parsedOrigenLng)
      : null;

  if (routeFrom && routeTo && routeFrom !== routeTo) {
    const params = new URLSearchParams({
      saddr: routeFrom,
      daddr: routeTo,
      hl: 'es',
      z: '14',
      output: 'embed',
    });
    return `https://www.google.com/maps?${params.toString()}`;
  }

  if (hasCourier) {
    const params = new URLSearchParams({
      q: formatPoint(parsedMensajeroLat, parsedMensajeroLng),
      hl: 'es',
      z: '16',
      output: 'embed',
    });
    return `https://www.google.com/maps?${params.toString()}`;
  }

  if (hasDestination) {
    const params = new URLSearchParams({
      q: formatPoint(parsedDestinoLat, parsedDestinoLng),
      hl: 'es',
      z: '16',
      output: 'embed',
    });
    return `https://www.google.com/maps?${params.toString()}`;
  }

  if (hasOrigin) {
    const params = new URLSearchParams({
      q: formatPoint(parsedOrigenLat, parsedOrigenLng),
      hl: 'es',
      z: '16',
      output: 'embed',
    });
    return `https://www.google.com/maps?${params.toString()}`;
  }

  const fallbackQuery = [origenTexto, destinoTexto].filter(Boolean).join(' ');
  const params = new URLSearchParams({
    q: fallbackQuery || 'Cali',
    hl: 'es',
    z: '13',
    output: 'embed',
  });
  return `https://www.google.com/maps?${params.toString()}`;
}