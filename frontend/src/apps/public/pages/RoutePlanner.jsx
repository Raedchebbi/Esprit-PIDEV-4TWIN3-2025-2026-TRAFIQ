import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import RouteCard from '../components/RouteCard';
import { useGeolocation } from '../../../shared/hooks/useGeolocation';
import { trafiqApi } from '../../../shared/services/trafiqApi';
import './RoutePlanner.css';

const startIcon = L.divIcon({ html: `<div style="background:#2E7D32;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, className: '', iconAnchor: [8, 8] });
const endIcon = L.divIcon({ html: `<div style="background:#E53935;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>`, className: '', iconAnchor: [8, 8] });
const accidentIcon = L.divIcon({ html: `<div style="background:#B71C1C;width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 0 12px rgba(183,28,28,0.65)"></div>`, className: '', iconAnchor: [9, 9] });

const PLACE_DEFS = [
    { id: 'vienne-en-val', label: 'Vienne-en-Val', fromCam: 'cam0', latOffset: 0.018, lngOffset: -0.024 },
    { id: 'neuvy-en-sullias', label: 'Neuvy-en-Sullias', fromCam: 'cam0', latOffset: 0.032, lngOffset: 0.030 },
    { id: 'tigy', label: 'Tigy', fromCam: 'cam0', latOffset: -0.022, lngOffset: 0.010 },
    { id: 'sandillon', label: 'Sandillon', fromCam: 'cam1', latOffset: 0.016, lngOffset: -0.020 },
    { id: 'jargeau', label: 'Jargeau', fromCam: 'cam1', latOffset: -0.018, lngOffset: 0.024 },
    { id: 'ferolles', label: 'Férolles', fromCam: 'cam1', latOffset: 0.028, lngOffset: 0.038 },
];

const FALLBACK_PLACES = [
    { id: 'vienne-en-val', label: 'Vienne-en-Val', lat: 47.8600, lng: 1.9920 },
    { id: 'neuvy-en-sullias', label: 'Neuvy-en-Sullias', lat: 47.8060, lng: 1.9680 },
    { id: 'tigy', label: 'Tigy', lat: 47.7980, lng: 1.8740 },
    { id: 'sandillon', label: 'Sandillon', lat: 47.8440, lng: 1.9990 },
    { id: 'jargeau', label: 'Jargeau', lat: 47.8600, lng: 2.1230 },
    { id: 'ferolles', label: 'Férolles', lat: 47.8040, lng: 1.9360 },
];

const ROUTE_COLORS = ['#1A73E8', '#FF8F00', '#E53935'];

function FitRouteBounds({ points }) {
    const map = useMap();

    useEffect(() => {
        if (!points || points.length < 2) return;
        map.fitBounds(points, { padding: [32, 32] });
    }, [map, points]);

    return null;
}

function haversineKm(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const earthRadius = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function routeStatusFromPenalty(penalty) {
    if (penalty >= 10) return 'blocked';
    if (penalty >= 4) return 'slow';
    return 'free';
}

function distancePointToSegmentKm(point, a, b) {
    const ax = a.lng;
    const ay = a.lat;
    const bx = b.lng;
    const by = b.lat;
    const px = point.lng;
    const py = point.lat;

    const abx = bx - ax;
    const aby = by - ay;
    const apx = px - ax;
    const apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    const proj = { lat: ay + aby * t, lng: ax + abx * t };

    return haversineKm(point, proj);
}

function buildRouteVariants(startPlace, endPlace, accidentWaypoints, vehicleCounts) {
    if (!startPlace || !endPlace) return [];

    const start = { lat: startPlace.lat, lng: startPlace.lng };
    const end = { lat: endPlace.lat, lng: endPlace.lng };

    const midLat = (start.lat + end.lat) / 2;
    const midLng = (start.lng + end.lng) / 2;
    const deltaLat = end.lat - start.lat;
    const deltaLng = end.lng - start.lng;

    const nearestAccident = accidentWaypoints
        .map((acc) => ({
            ...acc,
            d: distancePointToSegmentKm(acc, start, end),
        }))
        .sort((a, b) => a.d - b.d)[0] || null;

    const variants = [
        {
            id: 1,
            roads: [startPlace.label, endPlace.label],
            coords: [
                [start.lat, start.lng],
                [midLat, midLng],
                [end.lat, end.lng],
            ],
        },
        {
            id: 2,
            roads: ['Axe alternatif nord', endPlace.label],
            coords: [
                [start.lat, start.lng],
                [midLat + deltaLng * 0.22, midLng - deltaLat * 0.22],
                [end.lat, end.lng],
            ],
        },
        {
            id: 3,
            roads: ['Passage zone accident', endPlace.label],
            coords: nearestAccident
                ? [
                    [start.lat, start.lng],
                    [nearestAccident.lat, nearestAccident.lng],
                    [end.lat, end.lng],
                ]
                : [
                    [start.lat, start.lng],
                    [midLat - deltaLng * 0.2, midLng + deltaLat * 0.2],
                    [end.lat, end.lng],
                ],
        },
    ];

    const trafficPenalty = Math.round(((vehicleCounts.total ?? 0) / 25));

    return variants
        .map((variant, idx) => {
            const distanceKm = haversineKm(start, end) * (1 + idx * 0.08);
            const accidentPenalty = idx === 2 && nearestAccident ? 12 : idx === 1 ? 4 : 1;
            const penalty = accidentPenalty + trafficPenalty + idx;
            const status = routeStatusFromPenalty(penalty);
            const baseMinutes = (distanceKm / 38) * 60;
            const extraMin = status === 'blocked' ? 15 + idx * 3 : status === 'slow' ? 4 + idx * 2 : 0;
            const time = Math.max(3, Math.round(baseMinutes + extraMin));
            const riskIncidents = idx === 2 && nearestAccident ? 1 : 0;
            const isRecommended = idx === 0 && status !== 'blocked';

            return {
                id: variant.id,
                label: idx === 2 && nearestAccident
                    ? 'AVEC ACCIDENT'
                    : isRecommended
                        ? 'RECOMMANDE'
                        : status === 'blocked'
                            ? 'DECONSEILLE'
                            : `ALTERNATIF +${extraMin} min`,
                labelColor: isRecommended ? '#2E7D32' : status === 'blocked' ? '#B71C1C' : '#F57C00',
                labelBg: isRecommended ? '#E8F5E9' : status === 'blocked' ? '#FFEBEE' : '#FFF3E0',
                roads: variant.roads,
                time,
                dist: Number(distanceKm.toFixed(1)),
                status,
                incidents: riskIncidents,
                isAccident: idx === 2 && Boolean(nearestAccident),
                passesAccident: idx === 2 && Boolean(nearestAccident),
                extraMin,
                coords: variant.coords,
                color: ROUTE_COLORS[idx],
                weight: idx === 0 ? 5 : 3,
                opacity: idx === 0 ? 0.9 : 0.6,
                dashArray: idx === 0 ? null : idx === 1 ? '8,4' : '4,4',
            };
        })
        .sort((a, b) => a.time - b.time)
        .map((route, i) => ({
            ...route,
            id: i + 1,
            label: i === 0 && route.status !== 'blocked' ? 'RECOMMANDE' : route.label,
        }));
}

export default function RoutePlanner() {
    const { position } = useGeolocation();

    const [cameras, setCameras] = useState([]);
    const [activeIncidents, setActiveIncidents] = useState([]);
    const [vehicleCounts, setVehicleCounts] = useState({ total: 0, per_camera: [] });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [searched, setSearched] = useState(false);
    const [selectedId, setSelectedId] = useState(1);

    useEffect(() => {
        let isMounted = true;

        async function loadAll() {
            try {
                const [cams, incidents, counts] = await Promise.all([
                    trafiqApi.getCameras(),
                    trafiqApi.getActiveAccidents(),
                    trafiqApi.getVehicleCounts(),
                ]);

                if (!isMounted) return;
                setCameras(Array.isArray(cams) ? cams : []);
                setActiveIncidents(Array.isArray(incidents) ? incidents : []);
                setVehicleCounts(counts ?? { total: 0, per_camera: [] });
                setLoadError('');
            } catch {
                if (!isMounted) return;
                setLoadError('Connexion backend indisponible, mode local actif.');
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadAll();
        const iv = setInterval(loadAll, 5000);

        return () => {
            isMounted = false;
            clearInterval(iv);
        };
    }, []);

    const places = useMemo(() => {
        const cameraById = new Map(cameras.map((cam) => [cam.id, cam]));

        if (cameraById.size === 0) return FALLBACK_PLACES;

        return PLACE_DEFS.map((place) => {
            const camera = cameraById.get(place.fromCam);
            if (!camera) return FALLBACK_PLACES.find((fallback) => fallback.id === place.id);

            return {
                id: place.id,
                label: place.label,
                lat: camera.location.latitude + place.latOffset,
                lng: camera.location.longitude + place.lngOffset,
            };
        }).filter(Boolean);
    }, [cameras]);

    const accidentWaypoints = useMemo(() => {
        if (!activeIncidents.length || !cameras.length) return [];
        const cameraById = new Map(cameras.map((cam) => [cam.id, cam]));

        return activeIncidents
            .map((inc) => cameraById.get(inc.camera_id))
            .filter(Boolean)
            .map((cam) => ({
                id: cam.id,
                lat: cam.location.latitude,
                lng: cam.location.longitude,
            }));
    }, [activeIncidents, cameras]);

    const routes = useMemo(() => {
        if (!from || !to) return [];

        const fromPlace = places.find((p) => p.id === from);
        const toPlace = places.find((p) => p.id === to);
        if (!fromPlace || !toPlace) return [];

        return buildRouteVariants(fromPlace, toPlace, accidentWaypoints, vehicleCounts);
    }, [from, to, places, accidentWaypoints, vehicleCounts]);

    const selectedRoute = routes.find((r) => r.id === selectedId) || routes[0] || null;

    const handleSearch = () => {
        if (!from || !to) return;
        setSearched(true);
        const accidentRoute = routes.find((route) => route.passesAccident);
        setSelectedId(accidentRoute ? accidentRoute.id : 1);
    };

    const handleStart = route => {
        setSelectedId(route.id);
    };

    const mapCenter = useMemo(() => {
        if (selectedRoute?.coords?.[0]) return selectedRoute.coords[0];
        if (position) return [position.lat, position.lng];
        if (places[0]) return [places[0].lat, places[0].lng];
        return [36.808, 10.181];
    }, [selectedRoute, position, places]);

    return (
        <div className="planner-page">
            <div className="planner-map">
                <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                    <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
                    {searched && routes.map(route => (
                        <Polyline
                            key={route.id}
                            positions={route.coords}
                            color={route.color}
                            weight={route.id === selectedId ? route.weight + 2 : route.weight}
                            opacity={route.id === selectedId ? 1 : route.opacity}
                            dashArray={route.dashArray}
                        />
                    ))}
                    {searched && selectedRoute && (
                        <>
                            <FitRouteBounds points={selectedRoute.coords} />
                            <Marker position={selectedRoute.coords[0]} icon={startIcon}>
                                <Popup>📍 Départ : {places.find(p => p.id === from)?.label || from}</Popup>
                            </Marker>
                            <Marker position={selectedRoute.coords[selectedRoute.coords.length - 1]} icon={endIcon}>
                                <Popup>🏁 Destination : {places.find(p => p.id === to)?.label || to}</Popup>
                            </Marker>
                            {accidentWaypoints.map((acc) => (
                                <Marker key={`acc-${acc.id}`} position={[acc.lat, acc.lng]} icon={accidentIcon}>
                                    <Popup>
                                        <div style={{ minWidth: 180 }}>
                                            <div style={{ fontWeight: 700, color: '#B71C1C', marginBottom: 4 }}>🚨 Point accident</div>
                                            <div style={{ fontSize: '0.8rem', color: '#5A6A7A' }}>La route sélectionnée passe par ce point exact.</div>
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
                        <span className="planner-input-icon">📍</span>
                        <select value={from} onChange={e => setFrom(e.target.value)} className="planner-select">
                            <option value="">Point de départ...</option>
                            {places.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                        <button
                            className="planner-locate-btn"
                            onClick={() => {
                                if (!position || places.length === 0) return;
                                const nearest = places
                                    .map((p) => ({ p, d: haversineKm(position, { lat: p.lat, lng: p.lng }) }))
                                    .sort((a, b) => a.d - b.d)[0];
                                if (nearest) setFrom(nearest.p.id);
                            }}
                        >
                            📍 Ma pos
                        </button>
                    </div>
                    <div className="planner-divider" />
                    <div className="planner-input-row">
                        <span className="planner-input-icon">🏁</span>
                        <select value={to} onChange={e => setTo(e.target.value)} className="planner-select">
                            <option value="">Destination...</option>
                            {places
                                .filter(p => p.id !== from)
                                .map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                    </div>
                    <button className="planner-search-btn" onClick={handleSearch}>
                        Calculer les itinéraires →
                    </button>
                    {loading && <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#5A6A7A' }}>Chargement des données trafic...</div>}
                    {loadError && <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#B71C1C' }}>{loadError}</div>}
                </div>

                {searched && (
                    <div className="planner-results">
                        <div className="planner-results-title">{routes.length} itinéraires disponibles</div>
                        {routes.map(route => (
                            <RouteCard
                                key={route.id}
                                route={route}
                                selected={route.id === selectedId}
                                onStart={handleStart}
                            />
                        ))}
                        {routes.length === 0 && (
                            <div className="planner-empty-text">Aucun itinéraire disponible pour ce trajet.</div>
                        )}
                    </div>
                )}

                {!searched && (
                    <div className="planner-empty">
                        <div className="planner-empty-icon">🗺️</div>
                        <div className="planner-empty-text">Choisissez un départ et une destination<br />pour calculer les meilleurs itinéraires.</div>
                    </div>
                )}
            </div>
        </div>
    );
}
