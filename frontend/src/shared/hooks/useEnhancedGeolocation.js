// ── TRAFIQ — Enhanced Geolocation Hook ────────────────────────────────────────
// Extends the existing geolocation with speed, heading, movement state,
// and position smoothing for high-accuracy navigation tracking.

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Movement state classification thresholds (m/s):
 *   - stationary: < 0.5 m/s
 *   - walking:    0.5 – 2.5 m/s
 *   - driving:    > 2.5 m/s
 */
const SPEED_THRESHOLDS = { walking: 0.5, driving: 2.5 };
const MAX_HISTORY = 20;
const MIN_UPDATE_DISTANCE = 3; // meters — ignore updates smaller than this

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

function computeBearing(lat1, lng1, lat2, lng2) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function classifyMovement(speed) {
  if (speed < SPEED_THRESHOLDS.walking) return 'stationary';
  if (speed < SPEED_THRESHOLDS.driving) return 'walking';
  return 'driving';
}

export function useEnhancedGeolocation(options = {}) {
  const {
    enableHighAccuracy = true,
    minDistance = MIN_UPDATE_DISTANCE,
    timeout = 15000,
    maximumAge = 3000,
  } = options;
  const hasGeolocation =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const [position, setPosition] = useState(
    null
  );
  const [speed, setSpeed] = useState(0);
  const [heading, setHeading] = useState(0);
  const [accuracy, setAccuracy] = useState(null);
  const [movementState, setMovementState] = useState('stationary');
  const [error, setError] = useState(
    hasGeolocation ? null : 'Geolocation not supported'
  );
  const [isTracking, setIsTracking] = useState(false);
  const [positionHistory, setPositionHistory] = useState([]);

  const historyRef = useRef([]);
  const lastPositionRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const watchIdRef = useRef(null);

  const processPosition = useCallback(
    (geoPos) => {
      const now = Date.now();
      const newPos = {
        lat: geoPos.coords.latitude,
        lng: geoPos.coords.longitude,
        accuracy: geoPos.coords.accuracy,
        timestamp: now,
      };

      // Filter out jitter: ignore if moved less than minDistance
      if (lastPositionRef.current) {
        const dist = haversine(
          lastPositionRef.current.lat,
          lastPositionRef.current.lng,
          newPos.lat,
          newPos.lng
        );
        if (dist < minDistance && geoPos.coords.accuracy > 20) {
          return; // Too close + low accuracy = likely GPS jitter
        }
      }

      // Compute speed from GPS or from displacement
      let currentSpeed = 0;
      if (
        geoPos.coords.speed !== null &&
        geoPos.coords.speed !== undefined &&
        geoPos.coords.speed >= 0
      ) {
        currentSpeed = geoPos.coords.speed;
      } else if (lastPositionRef.current && lastTimestampRef.current) {
        const dist = haversine(
          lastPositionRef.current.lat,
          lastPositionRef.current.lng,
          newPos.lat,
          newPos.lng
        );
        const dt = (now - lastTimestampRef.current) / 1000;
        if (dt > 0) currentSpeed = dist / dt;
      }

      // Compute heading from GPS or from bearing
      let currentHeading = 0;
      if (
        geoPos.coords.heading !== null &&
        geoPos.coords.heading !== undefined &&
        !isNaN(geoPos.coords.heading)
      ) {
        currentHeading = geoPos.coords.heading;
      } else if (lastPositionRef.current) {
        currentHeading = computeBearing(
          lastPositionRef.current.lat,
          lastPositionRef.current.lng,
          newPos.lat,
          newPos.lng
        );
      }

      // Update position history
      historyRef.current = [
        ...historyRef.current.slice(-(MAX_HISTORY - 1)),
        newPos,
      ];
      setPositionHistory(historyRef.current);

      // Update state
      lastPositionRef.current = newPos;
      lastTimestampRef.current = now;

      setPosition({ lat: newPos.lat, lng: newPos.lng, accuracy: newPos.accuracy });
      setSpeed(Math.round(currentSpeed * 10) / 10);
      setHeading(Math.round(currentHeading));
      setAccuracy(Math.round(geoPos.coords.accuracy));
      setMovementState(classifyMovement(currentSpeed));
      setError(null);
      setIsTracking(true);
    },
    [minDistance]
  );

  useEffect(() => {
    if (!hasGeolocation) {
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      processPosition,
      (err) => {
        setError(err.message);
      },
      { enableHighAccuracy, timeout, maximumAge }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [
    enableHighAccuracy,
    timeout,
    maximumAge,
    processPosition,
    hasGeolocation,
  ]);

  return {
    position,
    speed,
    heading,
    accuracy,
    isMoving: movementState !== 'stationary',
    movementState,
    isTracking,
    error,
    positionHistory,
  };
}
