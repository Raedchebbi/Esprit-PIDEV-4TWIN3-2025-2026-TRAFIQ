// ── TRAFIQ — Route Session Context ───────────────────────────────────────────
// React context providing navigation session state to the entire public app.
// Integrates geolocation, route session, WebSocket, and scoped notifications.

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRouteSession } from '../hooks/useRouteSession';
import { useEnhancedGeolocation } from '../hooks/useEnhancedGeolocation';
import { usePublicSocket } from '../hooks/usePublicSocket';
import { useScopedNotifications } from '../hooks/useScopedNotifications';
import { useTrafik } from './TrafikContext';

const RouteSessionContext = createContext(null);

export function RouteSessionProvider({ children }) {
  const navigate = useNavigate();
  const { accidentsGPS } = useTrafik();

  // Enhanced geolocation with speed/heading
  const geo = useEnhancedGeolocation({
    enableHighAccuracy: true,
    minDistance: 5,
  });

  // Route session lifecycle
  const session = useRouteSession();
  const {
    sessionId,
    sessionToken,
    activeRoute,
    alerts: serverAlerts,
    isNavigating,
    startNavigation,
    endNavigation,
    updatePosition,
  } = session;

  // WebSocket for real-time alerts
  const socket = usePublicSocket();
  const {
    connected: wsConnected,
    alerts: wsAlerts,
    subscribeToRoute,
    unsubscribeFromRoute,
    updatePosition: pushSocketPosition,
  } = socket;

  // Scoped notifications
  const notifications = useScopedNotifications({
    incidents: accidentsGPS,
    routeCoords: activeRoute?.coords || null,
    userPosition: geo.position,
    routeRadiusMeters: 500,
    geoRadiusMeters: 1000,
    wsAlerts,
  });

  // Position update throttle ref
  const lastUpdateRef = useRef(0);

  useEffect(() => {
    if (!isNavigating || !geo.position) return;

    const now = Date.now();
    if (now - lastUpdateRef.current < 3000) return; // Throttle to 3s
    lastUpdateRef.current = now;

    updatePosition({
      lat: geo.position.lat,
      lng: geo.position.lng,
      heading: geo.heading,
      speed: geo.speed,
      accuracy: geo.accuracy,
    });

    if (sessionId) {
      pushSocketPosition(
        sessionId,
        geo.position.lat,
        geo.position.lng,
        geo.heading,
        geo.speed,
        sessionToken,
      );
    }
  }, [
    geo.position,
    geo.heading,
    geo.speed,
    geo.accuracy,
    isNavigating,
    sessionId,
    sessionToken,
    updatePosition,
    pushSocketPosition,
  ]);

  useEffect(() => {
    if (isNavigating && sessionId) {
      subscribeToRoute(sessionId, sessionToken);
    }
  }, [isNavigating, sessionId, sessionToken, subscribeToRoute]);

  async function startNavigationAndRedirect(route) {
    const newSessionId = await startNavigation(route);
    if (newSessionId) {
      navigate('/', { replace: true });
    }
    return newSessionId;
  }

  async function endNavigationAndCleanup() {
    if (sessionId) {
      unsubscribeFromRoute(sessionId);
    }
    await endNavigation();
  }

  const value = {
    // Geolocation
    position: geo.position,
    speed: geo.speed,
    heading: geo.heading,
    accuracy: geo.accuracy,
    isMoving: geo.isMoving,
    movementState: geo.movementState,
    isTracking: geo.isTracking,
    geoError: geo.error,

    // Navigation session
    sessionId,
    sessionToken,
    activeRoute,
    isNavigating,
    startNavigation: startNavigationAndRedirect,
    endNavigation: endNavigationAndCleanup,

    // Notifications
    scopedAlerts: notifications.scopedAlerts,
    alertCount: notifications.alertCount,
    routeAlertCount: notifications.routeAlertCount,
    geoAlertCount: notifications.geoAlertCount,
    dismissAlert: notifications.dismissAlert,

    // WebSocket state
    wsConnected,
    serverAlerts,
  };

  return (
    <RouteSessionContext.Provider value={value}>
      {children}
    </RouteSessionContext.Provider>
  );
}

export function useRouteSessionContext() {
  const ctx = useContext(RouteSessionContext);
  if (!ctx)
    throw new Error(
      'useRouteSessionContext must be used inside RouteSessionProvider',
    );
  return ctx;
}
