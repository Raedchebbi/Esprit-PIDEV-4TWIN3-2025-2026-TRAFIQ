// ── TRAFIQ — Scoped Notifications Hook ───────────────────────────────────────
// Filters notifications to only those relevant to the user's current route
// or geographic zone. Prevents global/irrelevant alerts.

import { useState, useMemo, useCallback } from 'react';

// Haversine distance in meters
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Perpendicular distance from point to line segment (approx in meters)
function pointToSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return haversine(px, py, ax, ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));
  return haversine(px, py, ax + t * dx, ay + t * dy);
}

// Check if a point is within radius of a polyline
function isNearPolyline(lat, lng, polyline, radiusMeters) {
  if (!polyline || polyline.length < 2) return false;
  for (let i = 0; i < polyline.length - 1; i++) {
    const dist = pointToSegmentDistance(
      lat,
      lng,
      polyline[i][0],
      polyline[i][1],
      polyline[i + 1][0],
      polyline[i + 1][1]
    );
    if (dist <= radiusMeters) return true;
  }
  return false;
}

/**
 * Scoped notifications hook.
 *
 * @param {Object} options
 * @param {Array} options.incidents - Raw incidents array (from context or WebSocket)
 * @param {Array} options.routeCoords - Active route polyline coords [[lat,lng], ...]
 * @param {Object} options.userPosition - Current user position { lat, lng }
 * @param {number} options.routeRadiusMeters - Route corridor radius (default 500m)
 * @param {number} options.geoRadiusMeters - Geo zone radius (default 1000m)
 * @param {Array} options.wsAlerts - Real-time alerts from WebSocket
 */
export function useScopedNotifications({
  incidents = [],
  routeCoords = null,
  userPosition = null,
  routeRadiusMeters = 500,
  geoRadiusMeters = 1000,
  wsAlerts = [],
} = {}) {
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const scopedAlerts = useMemo(() => {
    if (!userPosition) return [];

    const allIncidents = [
      // Map raw incidents to alert format
      ...incidents
        .filter((inc) => inc.lat && inc.lng && inc.active !== false)
        .map((inc) => ({
          id: inc.id || inc.incident_id,
          type: 'accident',
          severity: mapSeverity(inc.risk_level || inc.severity),
          title: getAlertTitle(inc),
          message: getAlertMessage(inc, userPosition),
          lat: inc.lat,
          lng: inc.lng,
          distance: Math.round(haversine(userPosition.lat, userPosition.lng, inc.lat, inc.lng)),
          timestamp: inc.timestamp || new Date().toISOString(),
          scope: null, // Will be set below
          cameraId: inc.camera_id,
        })),
      // Include WebSocket alerts
      ...wsAlerts.map((a) => ({
        id: a.incident_id || a.id || `ws_${a.cam_id}`,
        type: a.type || 'accident',
        severity: a.severity || 'medium',
        title: a.title || '⚠️ Alerte TRAFIQ',
        message: a.message || 'Incident détecté à proximité',
        lat: a.lat || 0,
        lng: a.lng || 0,
        distance: a.distance || 0,
        timestamp: a.timestamp || new Date().toISOString(),
        scope: a.scope || null,
        cameraId: a.cam_id || a.cameraId,
      })),
    ];

    return allIncidents
      .filter((alert) => {
        // Skip dismissed
        if (dismissedIds.has(alert.id)) return false;

        // Check route-scoped (within routeRadiusMeters of route polyline)
        if (routeCoords && routeCoords.length >= 2) {
          if (isNearPolyline(alert.lat, alert.lng, routeCoords, routeRadiusMeters)) {
            alert.scope = 'route';
            return true;
          }
        }

        // Check geo-scoped (within geoRadiusMeters of user position)
        if (alert.distance <= geoRadiusMeters) {
          alert.scope = 'geo';
          return true;
        }

        return false;
      })
      .sort((a, b) => a.distance - b.distance);
  }, [incidents, routeCoords, userPosition, routeRadiusMeters, geoRadiusMeters, wsAlerts, dismissedIds]);

  // Dismiss a specific alert
  const dismissAlert = useCallback((alertId) => {
    setDismissedIds((prev) => new Set([...prev, alertId]));
  }, []);

  // Clear all dismissed alerts (reset)
  const clearAll = useCallback(() => {
    setDismissedIds(new Set());
  }, []);

  return {
    scopedAlerts,
    alertCount: scopedAlerts.length,
    routeAlertCount: scopedAlerts.filter((a) => a.scope === 'route').length,
    geoAlertCount: scopedAlerts.filter((a) => a.scope === 'geo').length,
    dismissAlert,
    clearAll,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapSeverity(level) {
  if (!level) return 'medium';
  const l = String(level).toUpperCase();
  if (l === 'CRITICAL') return 'critical';
  if (l === 'HIGH' || l === 'high') return 'high';
  if (l === 'LOW' || l === 'low') return 'low';
  return 'medium';
}

function getAlertTitle(inc) {
  const type = inc.type || inc.incident_type || 'accident';
  const severity = inc.risk_level || inc.severity || 'medium';
  if (severity === 'CRITICAL' || severity === 'critical') {
    return '🚨 ACCIDENT CRITIQUE SUR VOTRE ROUTE';
  }
  if (type.includes('collision') || type.includes('ACCIDENT')) {
    return '⚠️ Accident détecté à proximité';
  }
  return '⚠️ Alerte TRAFIQ';
}

function getAlertMessage(inc, userPosition) {
  const dist = Math.round(
    haversine(userPosition.lat, userPosition.lng, inc.lat, inc.lng)
  );
  const risk = inc.risk_level ? ` Risque: ${inc.risk_level}.` : '';
  return `Incident à ${dist}m de votre position.${risk} Soyez vigilant.`;
}
