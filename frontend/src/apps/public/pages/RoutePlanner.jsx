import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
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

const PLACES = ['Centre-ville Tunis', 'Lac Tunis', 'Bardo', 'La Marsa', 'Carthage', 'Sousse'];

export default function RoutePlanner() {
  const { position } = useRouteSessionContext();
  const { routes, isLoading, error, fetchRoutes, clearRoutes } =
    useRouteRecommendations();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const resolvedSelectedId =
    routes.some((route) => route.id === selectedId) ? selectedId : routes[0]?.id;

  const selectedRoute = useMemo(() => {
    if (routes.length === 0) return null;
    return routes.find((route) => route.id === resolvedSelectedId) || routes[0];
  }, [routes, resolvedSelectedId]);

  const mapCenter = selectedRoute?.coords?.[0] || [MAP_DEFAULT_LAT, MAP_DEFAULT_LNG];

  const handleSearch = async () => {
    if (!from || !to) return;
    setSearched(true);
    await fetchRoutes(from, to, position);
  };

  const handleReset = () => {
    clearRoutes();
    setSearched(false);
    setSelectedId(null);
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
          <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
          {routes.map((route) => (
            <Polyline
              key={route.id}
              positions={route.coords}
              color={route.color}
              weight={route.id === resolvedSelectedId ? route.weight + 2 : route.weight}
              opacity={route.id === resolvedSelectedId ? 1 : route.opacity}
              dashArray={route.dashArray}
            />
          ))}
          {selectedRoute && (
            <>
              <Marker position={selectedRoute.coords[0]} icon={startIcon}>
                <Popup>📍 Départ : {from}</Popup>
              </Marker>
              <Marker
                position={selectedRoute.coords[selectedRoute.coords.length - 1]}
                icon={endIcon}
              >
                <Popup>🏁 Destination : {to}</Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>

      <div className="planner-panel">
        <div className="planner-search-box">
          <div className="planner-input-row">
            <span className="planner-input-icon">📍</span>
            <select
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="planner-select"
            >
              <option value="">Point de départ...</option>
              <option value="Ma position" hidden>
                📍 Ma position
              </option>
              {PLACES.map((place) => (
                <option key={place} value={place}>
                  {place}
                </option>
              ))}
            </select>
            <button
              className="planner-locate-btn"
              onClick={() => setFrom('Ma position')}
              type="button"
            >
              📍 Ma pos
            </button>
          </div>
          <div className="planner-divider" />
          <div className="planner-input-row">
            <span className="planner-input-icon">🏁</span>
            <select
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="planner-select"
            >
              <option value="">Destination...</option>
              {PLACES.filter((place) => place !== from).map((place) => (
                <option key={place} value={place}>
                  {place}
                </option>
              ))}
            </select>
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
            {error && <div className="planner-empty-text">{error}</div>}
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
            <div className="planner-empty-icon">🗺️</div>
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
