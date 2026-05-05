// ── TRAFIQ — Route Session Hook ──────────────────────────────────────────────
// Manages the lifecycle of a navigation session:
//   start → track position → poll alerts → end

import { useState, useCallback, useRef, useEffect } from 'react';
import { publicApi } from '../services/publicApi';

const POSITION_UPDATE_INTERVAL = 3000; // 3s
const ALERT_POLL_INTERVAL = 5000; // 5s

export function useRouteSession() {
  const [sessionId, setSessionId] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [activeRoute, setActiveRoute] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isNavigating, setIsNavigating] = useState(false);

  const alertIntervalRef = useRef(null);
  const lastPositionRef = useRef(null);

  const startNavigation = useCallback(async (route) => {
    try {
      const origin = {
        lat: route.coords[0][0],
        lng: route.coords[0][1],
      };
      const destination = {
        lat: route.coords[route.coords.length - 1][0],
        lng: route.coords[route.coords.length - 1][1],
      };

      const result = await publicApi.startNavigation(
        String(route.id),
        route.coords,
        origin,
        destination,
      );

      setSessionId(result.sessionId);
      setSessionToken(result.sessionToken || null);
      setActiveRoute(route);
      setIsNavigating(true);
      setAlerts([]);

      return result.sessionId;
    } catch (err) {
      console.warn(
        '[useRouteSession] Failed to start navigation:',
        err.message,
      );
      const localId = `local_${Date.now()}`;
      setSessionId(localId);
      setSessionToken(null);
      setActiveRoute(route);
      setIsNavigating(true);
      return localId;
    }
  }, []);

  // End the navigation session
  const endNavigation = useCallback(async () => {
    if (sessionId && !sessionId.startsWith('local_')) {
      try {
        await publicApi.endNavigation(sessionId, sessionToken);
      } catch {
        // Ignore cleanup errors
      }
    }

    setSessionId(null);
    setSessionToken(null);
    setActiveRoute(null);
    setIsNavigating(false);
    setAlerts([]);

    if (alertIntervalRef.current) {
      clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
  }, [sessionId, sessionToken]);

  const updatePosition = useCallback(
    async (position) => {
      if (!sessionId || sessionId.startsWith('local_')) return;
      lastPositionRef.current = position;

      try {
        await publicApi.updatePosition(
          sessionId,
          position.lat,
          position.lng,
          position.heading,
          position.speed,
          position.accuracy,
          sessionToken,
        );
      } catch {
        // Silently fail — position updates are best-effort
      }
    },
    [sessionId, sessionToken],
  );

  const pollAlerts = useCallback(async () => {
    if (!sessionId || sessionId.startsWith('local_')) return;

    try {
      const serverAlerts = await publicApi.getSessionAlerts(sessionId);
      if (Array.isArray(serverAlerts)) {
        setAlerts(serverAlerts);
      }
    } catch {
      // Silently fail — alert polling is best-effort
    }
  }, [sessionId]);

  // Set up periodic alert polling when navigating
  useEffect(() => {
    if (isNavigating && sessionId && !sessionId.startsWith('local_')) {
      alertIntervalRef.current = setInterval(pollAlerts, ALERT_POLL_INTERVAL);
      const initialPollTimer = setTimeout(() => {
        void pollAlerts();
      }, 0);

      return () => {
        clearTimeout(initialPollTimer);
        if (alertIntervalRef.current) {
          clearInterval(alertIntervalRef.current);
        }
      };
    }
  }, [isNavigating, sessionId, pollAlerts]);

  useEffect(() => {
    return () => {
      if (alertIntervalRef.current) clearInterval(alertIntervalRef.current);
    };
  }, []);

  return {
    sessionId,
    sessionToken,
    activeRoute,
    alerts,
    isNavigating,
    startNavigation,
    endNavigation,
    updatePosition,
    pollAlerts,
  };
}
