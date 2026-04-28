// ── TRAFIQ — Navigation Overlay ──────────────────────────────────────────────
// Floating HUD displayed on the Home page when a navigation session is active.
// Shows route info, ETA, speed, scoped alert count, and end-navigation control.

import React, { useState, useMemo } from 'react';
import { useRouteSessionContext } from '../../../shared/context/RouteSessionContext';
import './NavigationOverlay.css';

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

// Calculate total polyline distance in km
function polylineLength(coords) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversine(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
  }
  return total / 1000;
}

// Find closest point index on a polyline to a given position
function closestPointIndex(coords, lat, lng) {
  if (!coords || coords.length === 0) return 0;
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < coords.length; i++) {
    const d = haversine(lat, lng, coords[i][0], coords[i][1]);
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }
  return minIdx;
}

export default function NavigationOverlay() {
  const {
    isNavigating,
    activeRoute,
    position,
    speed,
    heading,
    alertCount,
    endNavigation,
  } = useRouteSessionContext();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isEnding, setIsEnding] = useState(false);

  // Compute progress, remaining distance, and ETA
  const routeInfo = useMemo(() => {
    if (!activeRoute?.coords || !position) {
      return { progress: 0, remainingKm: 0, etaMin: 0, totalKm: 0 };
    }

    const coords = activeRoute.coords;
    const totalKm = polylineLength(coords);
    const closestIdx = closestPointIndex(coords, position.lat, position.lng);

    // Distance covered = polyline from start to closest point
    let coveredKm = 0;
    for (let i = 0; i < closestIdx && i < coords.length - 1; i++) {
      coveredKm += haversine(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]) / 1000;
    }

    const remainingKm = Math.max(0, totalKm - coveredKm);
    const progress = totalKm > 0 ? Math.min(1, coveredKm / totalKm) : 0;

    // ETA based on current speed (or default 40 km/h city driving)
    const effectiveSpeedKmh = speed > 1 ? speed * 3.6 : 40;
    const etaMin = Math.round((remainingKm / effectiveSpeedKmh) * 60);

    return { progress, remainingKm, etaMin, totalKm };
  }, [activeRoute, position, speed]);

  // Format speed from m/s to km/h
  const speedKmh = useMemo(() => Math.round(speed * 3.6), [speed]);

  // Compass direction from heading
  const compassDir = useMemo(() => {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    return dirs[Math.round(heading / 45) % 8];
  }, [heading]);

  const handleEndNavigation = async () => {
    setIsEnding(true);
    try {
      await endNavigation();
    } finally {
      setIsEnding(false);
    }
  };

  if (!isNavigating || !activeRoute) return null;

  const routeName =
    activeRoute.label ||
    activeRoute.roads?.join(' → ') ||
    `Trajet ${activeRoute.id || ''}`;

  return (
    <div className={`nav-overlay ${isCollapsed ? 'nav-overlay--collapsed' : ''}`} id="navigation-overlay">
      {/* Collapse toggle */}
      <button
        className="nav-overlay__toggle"
        onClick={() => setIsCollapsed((c) => !c)}
        aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        <span className="nav-overlay__toggle-icon">
          {isCollapsed ? '▲' : '▼'}
        </span>
      </button>

      {/* Progress bar */}
      <div className="nav-overlay__progress-track">
        <div
          className="nav-overlay__progress-fill"
          style={{ width: `${Math.round(routeInfo.progress * 100)}%` }}
        />
        <div
          className="nav-overlay__progress-dot"
          style={{ left: `${Math.round(routeInfo.progress * 100)}%` }}
        />
      </div>

      {/* Route header */}
      <div className="nav-overlay__header">
        <div className="nav-overlay__route-info">
          <span className="nav-overlay__route-name">{routeName}</span>
          <span className="nav-overlay__route-status">
            {routeInfo.progress >= 0.95 ? '🏁 Arrivée imminente' : '🚗 En navigation'}
          </span>
        </div>
        {alertCount > 0 && (
          <div className="nav-overlay__alert-badge" id="nav-alert-badge">
            <span className="nav-overlay__alert-icon">⚠️</span>
            <span className="nav-overlay__alert-count">{alertCount}</span>
          </div>
        )}
      </div>

      {/* Stats row */}
      {!isCollapsed && (
        <>
          <div className="nav-overlay__stats">
            <div className="nav-overlay__stat">
              <span className="nav-overlay__stat-icon">⏱</span>
              <div className="nav-overlay__stat-content">
                <span className="nav-overlay__stat-value">
                  {routeInfo.etaMin > 0 ? `${routeInfo.etaMin}` : '<1'}
                </span>
                <span className="nav-overlay__stat-label">min</span>
              </div>
            </div>

            <div className="nav-overlay__stat-divider" />

            <div className="nav-overlay__stat">
              <span className="nav-overlay__stat-icon">📏</span>
              <div className="nav-overlay__stat-content">
                <span className="nav-overlay__stat-value">
                  {routeInfo.remainingKm.toFixed(1)}
                </span>
                <span className="nav-overlay__stat-label">km restants</span>
              </div>
            </div>

            <div className="nav-overlay__stat-divider" />

            <div className="nav-overlay__stat">
              <span className="nav-overlay__stat-icon">🏎️</span>
              <div className="nav-overlay__stat-content">
                <span className="nav-overlay__stat-value">{speedKmh}</span>
                <span className="nav-overlay__stat-label">km/h</span>
              </div>
            </div>

            <div className="nav-overlay__stat-divider" />

            <div className="nav-overlay__stat">
              <span className="nav-overlay__stat-icon">🧭</span>
              <div className="nav-overlay__stat-content">
                <span className="nav-overlay__stat-value">{compassDir}</span>
                <span className="nav-overlay__stat-label">{heading}°</span>
              </div>
            </div>
          </div>

          {/* Guidance bar */}
          <div className="nav-overlay__guidance">
            <div className="nav-overlay__guidance-icon">
              {routeInfo.progress >= 0.95 ? '🏁' : '↗️'}
            </div>
            <div className="nav-overlay__guidance-text">
              {routeInfo.progress >= 0.95
                ? 'Vous êtes arrivé à destination'
                : `Continuez tout droit — ${routeInfo.remainingKm.toFixed(1)} km restants`}
            </div>
          </div>

          {/* End navigation button */}
          <button
            className="nav-overlay__end-btn"
            onClick={handleEndNavigation}
            disabled={isEnding}
            id="end-navigation-btn"
          >
            {isEnding ? (
              <>
                <span className="nav-overlay__end-spinner" />
                Arrêt en cours...
              </>
            ) : (
              <>✕ Terminer la navigation</>
            )}
          </button>
        </>
      )}
    </div>
  );
}
