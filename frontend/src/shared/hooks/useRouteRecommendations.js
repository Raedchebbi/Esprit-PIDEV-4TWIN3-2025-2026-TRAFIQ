// ── TRAFIQ — Route Recommendations Hook ──────────────────────────────────────
// Fetches AI-scored route suggestions from the backend.
// Falls back to existing mock data if backend is unreachable.

import { useState, useCallback } from 'react';
import { publicApi } from '../services/publicApi';

const COORDINATE_PATTERN =
  /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

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

      // Resolve freeform coordinate pairs like "47.79407, 2.19252".
      const origin = resolveCoords(from, userPosition);
      const destination = resolveCoords(to, userPosition);

      if (!origin || !destination) {
        setError('Entrez les coordonnees au format "latitude, longitude".');
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
      : null;
  }

  if (typeof placeName !== 'string') {
    return null;
  }

  const match = placeName.match(COORDINATE_PATTERN);
  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
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
    activeIncidents: Array.isArray(route.activeIncidents)
      ? route.activeIncidents
      : route.incidents ?? 0,
  };
}
