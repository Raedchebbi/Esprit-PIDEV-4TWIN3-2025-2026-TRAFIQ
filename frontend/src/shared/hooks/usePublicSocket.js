// ── TRAFIQ — Public WebSocket Hook ────────────────────────────────────────────
// Connects to the /public Socket.io namespace for real-time navigation events.

import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_IO_PATH, WS_BASE_URL } from '../config/runtimeConfig';

function appendAlerts(setAlerts, incomingAlerts) {
  setAlerts((previousAlerts) => {
    const nextAlerts = [...previousAlerts];

    for (const alert of incomingAlerts) {
      const alertId = alert.id || alert.incident_id || `${alert.type}_${alert.cameraId || alert.cam_id || 'unknown'}`;
      const alreadyExists = nextAlerts.some(
        (existing) => existing.id === alertId || existing.incident_id === alertId,
      );

      if (!alreadyExists) {
        nextAlerts.push({ ...alert, id: alertId, receivedAt: Date.now() });
      }
    }

    return nextAlerts.slice(-20);
  });
}

export function usePublicSocket() {
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [congestionUpdate, setCongestionUpdate] = useState(null);
  const socketRef = useRef(null);
  const subscribedSessionRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const socket = io(`${WS_BASE_URL}/public`, {
      path: SOCKET_IO_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
      autoConnect: true,
    });

    socket.on('connect', () => {
      setConnected(true);
      // Re-subscribe if we had an active session before reconnect
      if (subscribedSessionRef.current) {
        socket.emit('subscribe_route', {
          sessionId: subscribedSessionRef.current,
        });
      }
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('navigation_alert', (data) => {
      appendAlerts(setAlerts, [data]);
    });

    socket.on('route_congestion_update', (data) => {
      setCongestionUpdate(data);
      const normalizedAlerts = Array.isArray(data)
        ? data
        : data
          ? [data]
          : [];

      if (normalizedAlerts.length > 0) {
        appendAlerts(setAlerts, normalizedAlerts);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Subscribe to route alerts for a navigation session
  const subscribeToRoute = useCallback((sessionId) => {
    subscribedSessionRef.current = sessionId;
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_route', { sessionId });
    }
  }, []);

  // Unsubscribe from route alerts
  const unsubscribeFromRoute = useCallback((sessionId) => {
    subscribedSessionRef.current = null;
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe_route', { sessionId });
    }
    setAlerts([]);
  }, []);

  // Update user position on the server
  const updatePosition = useCallback((sessionId, lat, lng, heading, speed) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('update_position', {
        sessionId,
        lat,
        lng,
        heading,
        speed,
      });
    }
  }, []);

  // Clear acknowledged alerts
  const dismissAlert = useCallback((alertId) => {
    setAlerts((prev) => prev.filter((a) => a.incident_id !== alertId && a.id !== alertId));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  return {
    connected,
    alerts,
    congestionUpdate,
    subscribeToRoute,
    unsubscribeFromRoute,
    updatePosition,
    dismissAlert,
    clearAlerts,
  };
}
