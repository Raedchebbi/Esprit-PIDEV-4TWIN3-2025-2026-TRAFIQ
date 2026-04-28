// ── TRAFIQ — Route Recommendations Hook ──────────────────────────────────────
// Fetches AI-scored route suggestions from the backend.
// Falls back to existing mock data if backend is unreachable.

import { useState, useCallback } from 'react';
import { publicApi } from '../services/publicApi';

// Coordinate mapping for known places (matches RoutePlanner PLACES list)
const PLACE_COORDS = {
  'Centre-ville Tunis': { lat: 36.8065, lng: 10.1815 },
  'Lac Tunis': { lat: 36.8312, lng: 10.2274 },
  Bardo: { lat: 36.8088, lng: 10.1354 },
  'La Marsa': { lat: 36.8785, lng: 10.3247 },
  Carthage: { lat: 36.8586, lng: 10.3234 },
  Sousse: { lat: 35.8245, lng: 10.6346 },
  'Ma position': null, // Will use current geolocation
};

export function useRouteRecommendations() {
  const [routes, setRoutes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRoutes = useCallback(
    async (from, to, userPosition) => {
      if (!from || !to) {
        setRoutes([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      // Resolve place names to coordinates
      const origin = resolveCoords(from, userPosition);
      const destination = resolveCoords(to, userPosition);

      if (!origin || !destination) {
        setError('Could not resolve coordinates');
        setRoutes([]);
        setIsLoading(false);
        return;
      }

      try {
        const result = await publicApi.suggestRoutes(
          origin.lat,
          origin.lng,
          destination.lat,
          destination.lng
        );

        if (Array.isArray(result) && result.length > 0) {
          setRoutes(result.map(normalizeRoute));
        } else {
          setError('Aucun itinéraire disponible pour cette sélection.');
          setRoutes([]);
        }
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Le service de recommandations est indisponible.';
        console.warn('[useRouteRecommendations] Backend unavailable:', message);
        setError(message);
        setRoutes([]);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const clearRoutes = useCallback(() => {
    setRoutes([]);
    setError(null);
  }, []);

  return {
    routes,
    isLoading,
    error,
    fetchRoutes,
    clearRoutes,
  };
}

function resolveCoords(placeName, userPosition) {
  if (placeName === 'Ma position') {
    return userPosition
      ? { lat: userPosition.lat, lng: userPosition.lng }
      : PLACE_COORDS['Centre-ville Tunis'];
  }
  return PLACE_COORDS[placeName] || null;
}

function normalizeRoute(route) {
  const status = route.status || 'slow';
  let aiLabel = route.aiLabel;

  if (!aiLabel) {
    if (status === 'free' || /recommand/i.test(route.label || '')) {
      aiLabel = 'RECOMMENDED';
    } else if (
      status === 'blocked' ||
      /d[ée]conseill/i.test(route.label || '')
    ) {
      aiLabel = 'NOT_RECOMMENDED';
    } else {
      aiLabel = 'ALTERNATIVE';
    }
  }

  return {
    ...route,
    aiLabel,
    activeIncidents: route.incidents ?? 0,
  };
}
