import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, Flag, LocateFixed, MapPin, MapPinned } from 'lucide-react';
import RouteRecommendationCard from '../components/RouteRecommendationCard';
import { useRouteRecommendations } from '../../../shared/hooks/useRouteRecommendations';
import {
  MAP_DEFAULT_LAT,
  MAP_DEFAULT_LNG,
  MAP_DEFAULT_ZOOM,
} from '../../../shared/config/runtimeConfig';
import { useRouteSessionContext } from '../../../shared/context/RouteSessionContext';
import './RoutePlanner.css';

const startIcon = L.divIcon({ html: `<div style="background:#2E7D32;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, className: '', iconAnchor: [8, 8] });
const endIcon = L.divIcon({ html: `<div style="background:#E53935;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, className: '', iconAnchor: [8, 8] });
const incidentIcon = L.divIcon({ html: `<div style="background:#E53935;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(229,57,53,0.5)"><span style="width:12px;height:12px;border-radius:999px;background:white;display:block"></span></div>`, className: '', iconAnchor: [14, 14] });

function PlannerViewport({ center, routeCoords }) {
  const map = useMap();

  useEffect(() => {
    if (routeCoords && routeCoords.length > 1) {
      map.fitBounds(routeCoords, { padding: [40, 40] });
      return;
    }

    if (center) {
      map.setView(center, MAP_DEFAULT_ZOOM);
    }
  }, [map, center, routeCoords]);

  return null;
}

function parseCoordinateInput(value) {
  const match =
    typeof value === 'string'
      ? value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/)
      : null;
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return [lat, lng];
}

export default function RoutePlanner() {
  const { position, navigationError } = useRouteSessionContext();
  const { routes, isLoading, error, fetchRoutes, clearRoutes } =
    useRouteRecommendations();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [searchCenter, setSearchCenter] = useState(null);

  const resolvedSelectedId =
    routes.some((route) => route.id === selectedId) ? selectedId : routes[0]?.id;

  const selectedRoute = useMemo(() => {
    if (routes.length === 0) return null;
    return routes.find((route) => route.id === resolvedSelectedId) || routes[0];
  }, [routes, resolvedSelectedId]);
  const routeIncidents = Array.isArray(selectedRoute?.activeIncidents)
    ? selectedRoute.activeIncidents
    : [];

  const originCoords = useMemo(() => parseCoordinateInput(from), [from]);
  const mapCenter = originCoords || selectedRoute?.coords?.[0] || [MAP_DEFAULT_LAT, MAP_DEFAULT_LNG];

  const handleSearch = async () => {
    if (!from || !to) return;
    setSearched(true);
    setSearchCenter(originCoords);
    await fetchRoutes(from, to, position);
  };

  const handleReset = () => {
    clearRoutes();
    setSearched(false);
    setSelectedId(null);
    setSearchCenter(null);
  };

  return (
    <div className="planner-page">
      <div className="planner-map">
        <MapContainer
          center={mapCenter}
          zoom={MAP_DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <PlannerViewport center={searchCenter || mapCenter} routeCoords={selectedRoute?.coords || null} />
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          {routes.map((route) => (
            <Polyline
              key={route.id}
              positions={route.coords}
              color={route.color}
              weight={route.id === resolvedSelectedId ? route.weight + 2 : route.weight}
              opacity={route.id === resolvedSelectedId ? 1 : route.opacity}
              dashArray={route.dashArray}
              pathOptions={{ lineCap: 'round', lineJoin: 'round' }}
            />
          ))}
          {selectedRoute && (
            <>
              <Marker position={selectedRoute.coords[0]} icon={startIcon}>
                <Popup>Départ : {from}</Popup>
              </Marker>
              <Marker
                position={selectedRoute.coords[selectedRoute.coords.length - 1]}
                icon={endIcon}
              >
                <Popup>Destination : {to}</Popup>
              </Marker>
              {routeIncidents.map((incident) => (
                <Marker
                  key={incident.incident_id || `${incident.camera_id}-${incident.lat}-${incident.lng}`}
                  position={[incident.lat, incident.lng]}
                  icon={incidentIcon}
                >
                  <Popup>
                    <div style={{ minWidth: 180, fontFamily: 'var(--font-body)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#E53935', marginBottom: 4 }}>
                        <AlertTriangle size={14} aria-hidden="true" />
                        {incident.incident_type || 'Accident'}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#5A6A7A' }}>Caméra : <b>{incident.camera_id}</b></div>
                      <div style={{ fontSize: '0.8rem', color: '#5A6A7A' }}>Zone : <b>{incident.area || 'Inconnue'}</b></div>
                      {incident.risk_level && (
                        <div style={{ fontSize: '0.8rem', color: '#5A6A7A' }}>Risque : <b>{incident.risk_level}</b></div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </>
          )}
        </MapContainer>
      </div>

      <div className="planner-panel">
        <div className="planner-search-box">
          <div className="planner-input-row">
            <MapPin className="planner-input-icon" size={16} aria-hidden="true" />
            <input
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="planner-input"
              placeholder="Latitude, longitude"
              inputMode="decimal"
            />
            <button
              className="planner-locate-btn"
              onClick={() => {
                if (!position) return;
                setFrom(`${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
              }}
              type="button"
              disabled={!position}
            >
              <LocateFixed size={14} aria-hidden="true" />
              Ma pos
            </button>
          </div>
          <div className="planner-divider" />
          <div className="planner-input-row">
            <Flag className="planner-input-icon" size={16} aria-hidden="true" />
            <input
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="planner-input"
              placeholder="Latitude, longitude"
              inputMode="decimal"
            />
          </div>
          <div className="planner-hint">
            Utilisez des coordonnees reelles au format <code>latitude, longitude</code>.
            Exemple France: <code>47.79407, 2.19252</code>
          </div>
          <button
            className="planner-search-btn"
            onClick={handleSearch}
            disabled={isLoading || !from || !to}
            type="button"
          >
            {isLoading ? 'Calcul en cours...' : 'Calculer les itinéraires →'}
          </button>
          {searched && (
            <button
              className="planner-locate-btn"
              onClick={handleReset}
              type="button"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {searched && (
          <div className="planner-results">
            <div className="planner-results-title">
              {routes.length > 0
                ? `${routes.length} itinéraire(s) disponible(s)`
                : 'Aucun itinéraire disponible'}
            </div>
            {selectedRoute && routeIncidents.length > 0 && (
              <div className="planner-empty-text">
                {routeIncidents.length} incident(s) matérialisé(s) sur la carte pour l'itinéraire sélectionné.
              </div>
            )}
            {error && <div className="planner-empty-text">{error}</div>}
            {navigationError && (
              <div className="planner-empty-text">Navigation indisponible: {navigationError}</div>
            )}
            {routes.map((route) => (
              <RouteRecommendationCard
                key={route.id}
                route={route}
                selected={route.id === resolvedSelectedId}
                onSelect={(selectedRouteOption) =>
                  setSelectedId(selectedRouteOption.id)
                }
              />
            ))}
          </div>
        )}

        {!searched && (
          <div className="planner-empty">
            <MapPinned className="planner-empty-icon" size={48} aria-hidden="true" />
            <div className="planner-empty-text">
              Choisissez un départ et une destination
              <br />
              pour calculer les meilleurs itinéraires.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
