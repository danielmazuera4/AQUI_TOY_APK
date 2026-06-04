/**
 * Google Directions API Service
 * Fetches real routes between coordinates using Google Directions API
 */

type DirectionsResponse = {
  routes: {
    summary: string;
    legs: {
      distance: {
        text: string;
        value: number;
      };
      duration: {
        text: string;
        value: number;
      };
      steps: any[];
    }[];
    overview_polyline: {
      points: string;
    };
  }[];
  status: string;
  error_message?: string;
};

type RouteResult = {
  polyline: string;
  distance: string;
  distanceValue: number;
  duration: string;
  durationValue: number;
  decodedPoints: { latitude: number; longitude: number }[];
};

/**
 * Decodes Google's encoded polyline string into an array of coordinates
 * Based on the algorithm described in:
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const coordinates: { latitude: number; longitude: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return coordinates;
}

/**
 * Fetches route from Google Directions API
 * @param originLat Origin latitude
 * @param originLng Origin longitude
 * @param destLat Destination latitude
 * @param destLng Destination longitude
 * @param apiKey Google Maps API key
 * @returns Route result with polyline, distance, and duration
 */
export async function fetchGoogleDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<RouteResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json() as DirectionsResponse;

    if (data.status !== 'OK') {
      return null;
    }

    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const leg = route.legs[0];
    const polyline = route.overview_polyline.points;
    const decodedPoints = decodePolyline(polyline);

    return {
      polyline,
      distance: leg.distance.text,
      distanceValue: leg.distance.value,
      duration: leg.duration.text,
      durationValue: leg.duration.value,
      decodedPoints,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Fetches route with waypoints (origin -> current -> destination)
 * @param originLat Origin latitude
 * @param originLng Origin longitude
 * @param currentLat Current location latitude (messenger)
 * @param currentLng Current location longitude (messenger)
 * @param destLat Destination latitude
 * @param destLng Destination longitude
 * @param apiKey Google Maps API key
 * @returns Route result with polyline, distance, and duration
 */
export async function fetchGoogleDirectionsWithWaypoint(
  originLat: number,
  originLng: number,
  currentLat: number,
  currentLng: number,
  destLat: number,
  destLng: number,
  apiKey: string
): Promise<RouteResult | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&waypoints=${currentLat},${currentLng}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json() as DirectionsResponse;

    if (data.status !== 'OK') {
      return null;
    }

    if (!data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const totalDistance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0);
    const totalDuration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0);

    const polyline = route.overview_polyline.points;
    const decodedPoints = decodePolyline(polyline);

    const formatDistance = (meters: number): string => {
      if (meters >= 1000) {
        return `${(meters / 1000).toFixed(1)} km`;
      }
      return `${meters} m`;
    };

    const formatDuration = (seconds: number): string => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (hours > 0) {
        return `${hours}h ${minutes}min`;
      }
      return `${minutes} min`;
    };

    const formattedDistance = formatDistance(totalDistance);
    const formattedDuration = formatDuration(totalDuration);

    return {
      polyline,
      distance: formattedDistance,
      distanceValue: totalDistance,
      duration: formattedDuration,
      durationValue: totalDuration,
      decodedPoints,
    };
  } catch (error) {
    return null;
  }
}
