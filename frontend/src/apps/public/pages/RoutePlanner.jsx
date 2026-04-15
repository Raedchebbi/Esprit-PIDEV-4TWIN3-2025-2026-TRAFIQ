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
const ROUTING_API = 'https://router.project-osrm.org';

const PLACE_DEFS = [
    { id: 'vienne-en-val', label: 'Vienne-en-Val', dashcam: 'Dashcam 1', fromCam: 'cam0', latOffset: 0.004, lngOffset: -0.010 },
    { id: 'neuvy-en-sullias', label: 'Neuvy-en-Sullias', dashcam: 'Dashcam 1', fromCam: 'cam0', latOffset: 0.008, lngOffset: 0.006 },
    { id: 'carrizo-de-la-ribera', label: 'Carrizo de la Ribera', dashcam: 'Dashcam 2', fromCam: 'cam1', latOffset: -0.004, lngOffset: 0.008 },
    { id: 'villanueva-de-carrizo', label: 'Villanueva de Carrizo', dashcam: 'Dashcam 2', fromCam: 'cam1', latOffset: 0.006, lngOffset: -0.006 },
    { id: 'solyanka', label: 'Solyanka', dashcam: 'Dashcam 3', fromCam: 'cam2', latOffset: 0.005, lngOffset: -0.008 },
    { id: 'sadovyy', label: 'Sadovyy', dashcam: 'Dashcam 3', fromCam: 'cam2', latOffset: -0.005, lngOffset: 0.009 },
    { id: 'tpycobo', label: 'Tpycobo', dashcam: 'Dashcam 4', fromCam: 'cam3', latOffset: 0.004, lngOffset: 0.010 },
    { id: 'kulakovka', label: 'Kulakovka', dashcam: 'Dashcam 4', fromCam: 'cam3', latOffset: -0.004, lngOffset: -0.007 },
    { id: 'boevaya-36', label: 'Астрахань, Боевая, 36', dashcam: 'Dashcam 5', fromCam: 'cam4', latOffset: 0.006, lngOffset: -0.005 },
    { id: 'bogdana-hmelnitskogo-17', label: 'Астрахань, Богдана Хмельницкого, 17', dashcam: 'Dashcam 5', fromCam: 'cam4', latOffset: -0.006, lngOffset: 0.008 },
    { id: 'boevaya-45', label: 'Астрахань, Боевая, 45', dashcam: 'Dashcam 6', fromCam: 'cam5', latOffset: 0.004, lngOffset: -0.007 },
    { id: 'sadovyy-2', label: 'Sadovyy', dashcam: 'Dashcam 6', fromCam: 'cam5', latOffset: -0.005, lngOffset: 0.007 },
];

const FALLBACK_PLACES = [
    { id: 'vienne-en-val', label: 'Vienne-en-Val', dashcam: 'Dashcam 1', lat: 47.8460, lng: 2.0970 },
    { id: 'neuvy-en-sullias', label: 'Neuvy-en-Sullias', dashcam: 'Dashcam 1', lat: 47.8120, lng: 2.1150 },
    { id: 'carrizo-de-la-ribera', label: 'Carrizo de la Ribera', dashcam: 'Dashcam 2', lat: 42.9600, lng: -5.8200 },
    { id: 'villanueva-de-carrizo', label: 'Villanueva de Carrizo', dashcam: 'Dashcam 2', lat: 42.9700, lng: -5.8000 },
    { id: 'solyanka', label: 'Solyanka', dashcam: 'Dashcam 3', lat: 46.3400, lng: 48.0400 },
    { id: 'sadovyy', label: 'Sadovyy', dashcam: 'Dashcam 3', lat: 46.3500, lng: 48.0550 },
    { id: 'tpycobo', label: 'Tpycobo', dashcam: 'Dashcam 4', lat: 46.3360, lng: 48.0200 },
    { id: 'kulakovka', label: 'Kulakovka', dashcam: 'Dashcam 4', lat: 46.3440, lng: 48.0280 },
    { id: 'boevaya-36', label: 'Астрахань, Боевая, 36', dashcam: 'Dashcam 5', lat: 46.3386, lng: 48.0209 },
    { id: 'bogdana-hmelnitskogo-17', label: 'Астрахань, Богдана Хмельницкого, 17', dashcam: 'Dashcam 5', lat: 46.3364, lng: 48.0293 },
    { id: 'boevaya-45', label: 'Астрахань, Боевая, 45', dashcam: 'Dashcam 6', lat: 46.3363, lng: 48.0226 },
    { id: 'sadovyy-2', label: 'Sadovyy', dashcam: 'Dashcam 6', lat: 46.3614, lng: 48.0626 },
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

function polylineDistanceKm(points) {
    if (!points || points.length < 2) return 0;

    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        total += haversineKm(
            { lat: current[0], lng: current[1] },
            { lat: next[0], lng: next[1] },
        );
    }
    return total;
}

function buildStreetPath(start, end, laneOffset = 0) {
    const pivotLng = start.lng + (end.lng - start.lng) * 0.5;
    const pivotLat = start.lat + (end.lat - start.lat) * 0.5;

    return [
        [start.lat, start.lng],
        [start.lat, pivotLng + laneOffset],
        [pivotLat + laneOffset, pivotLng + laneOffset],
        [pivotLat + laneOffset, end.lng - laneOffset],
        [end.lat, end.lng],
    ];
}

function buildAccidentPath(start, via, end, laneOffset = 0) {
    const approachLng = start.lng + (via.lng - start.lng) * 0.45 + laneOffset;
    const approachLat = start.lat + (via.lat - start.lat) * 0.45 + laneOffset;
    const exitLng = via.lng + (end.lng - via.lng) * 0.45 - laneOffset;
    const exitLat = via.lat + (end.lat - via.lat) * 0.45 - laneOffset;

    return [
        [start.lat, start.lng],
        [start.lat, approachLng],
        [approachLat, approachLng],
        [via.lat, via.lng],
        [via.lat, exitLng],
        [exitLat, exitLng],
        [end.lat, end.lng],
    ];
}

function toOsrmCoord(place) {
    return `${place.lng},${place.lat}`;
}

function routeFromOsrm(osrmRoute, routeId, overrides = {}) {
    const coords = (osrmRoute.geometry?.coordinates || []).map(([lng, lat]) => [lat, lng]);
    return {
        id: routeId,
        label: overrides.label || 'RECOMMANDE',
        labelColor: overrides.labelColor || '#2E7D32',
        labelBg: overrides.labelBg || '#E8F5E9',
        roads: overrides.roads || [],
        time: Math.max(1, Math.round((osrmRoute.duration || 0) / 60)),
        dist: Number(((osrmRoute.distance || 0) / 1000).toFixed(1)),
        status: overrides.status || 'free',
        incidents: overrides.incidents || 0,
        isAccident: Boolean(overrides.isAccident),
        passesAccident: Boolean(overrides.passesAccident),
        extraMin: overrides.extraMin || 0,
        coords,
        color: overrides.color || ROUTE_COLORS[0],
        weight: overrides.weight || 5,
        opacity: overrides.opacity || 0.95,
        dashArray: overrides.dashArray || null,
    };
}

async function fetchOsrmRoutes(origin, destination, accidentWaypoint) {
    const directUrl = `${ROUTING_API}/route/v1/driving/${toOsrmCoord(origin)};${toOsrmCoord(destination)}?alternatives=true&overview=full&geometries=geojson&steps=false`;
    const directResponse = await fetch(directUrl);
    if (!directResponse.ok) throw new Error(`OSRM direct route failed: ${directResponse.status}`);

    const directData = await directResponse.json();
    const routes = [];

    if (Array.isArray(directData.routes) && directData.routes[0]) {
        routes.push(routeFromOsrm(directData.routes[0], 1, {
            label: 'RECOMMANDE',
            labelColor: '#2E7D32',
            labelBg: '#E8F5E9',
            roads: [origin.label, destination.label],
            status: 'free',
            color: ROUTE_COLORS[0],
            weight: 5,
            opacity: 0.98,
        }));
    }

    if (Array.isArray(directData.routes) && directData.routes[1]) {
        routes.push(routeFromOsrm(directData.routes[1], 2, {
            label: 'ALTERNATIF',
            labelColor: '#F57C00',
            labelBg: '#FFF3E0',
            roads: [origin.label, destination.label],
            status: 'slow',
            color: ROUTE_COLORS[1],
            weight: 4,
            opacity: 0.7,
            dashArray: '8,4',
        }));
    }

    if (accidentWaypoint) {
        const viaUrl = `${ROUTING_API}/route/v1/driving/${toOsrmCoord(origin)};${toOsrmCoord(accidentWaypoint)};${toOsrmCoord(destination)}?overview=full&geometries=geojson&steps=false`;
        const viaResponse = await fetch(viaUrl);
        if (!viaResponse.ok) throw new Error(`OSRM via-accident route failed: ${viaResponse.status}`);

        const viaData = await viaResponse.json();
        if (Array.isArray(viaData.routes) && viaData.routes[0]) {
            routes.push(routeFromOsrm(viaData.routes[0], 3, {
                label: 'AVEC ACCIDENT',
                labelColor: '#B71C1C',
                labelBg: '#FFEBEE',
                roads: [origin.label, 'Point accident', destination.label],
                status: 'blocked',
                incidents: 1,
                isAccident: true,
                passesAccident: true,
                extraMin: 0,
                color: ROUTE_COLORS[2],
                weight: 5,
                opacity: 0.95,
            }));
        }
    }

    return routes;
}

function buildRouteVariants(startPlace, endPlace, accidentWaypoints, vehicleCounts) {
    if (!startPlace || !endPlace) return [];

    const start = { lat: startPlace.lat, lng: startPlace.lng };
    const end = { lat: endPlace.lat, lng: endPlace.lng };

    const nearestAccident = accidentWaypoints
        .map((acc) => ({
            ...acc,
            d: distancePointToSegmentKm(acc, start, end),
        }))
        .sort((a, b) => a.d - b.d)[0] || null;

    const baseRoute = buildStreetPath(start, end, 0);
    const altRouteNorth = buildStreetPath(start, end, 0.006);
    const altRouteSouth = buildStreetPath(start, end, -0.006);
    const accidentRoute = nearestAccident
        ? buildAccidentPath(start, nearestAccident, end, 0.004)
        : buildStreetPath(start, end, 0.01);

    const variants = [
        {
            id: 1,
            roads: [startPlace.label, endPlace.label],
            coords: baseRoute,
        },
        {
            id: 2,
            roads: ['Axe alternatif nord', endPlace.label],
            coords: altRouteNorth,
        },
        {
            id: 3,
            roads: ['Passage zone accident', endPlace.label],
            coords: accidentRoute,
        },
    ];

    const trafficPenalty = Math.round(((vehicleCounts.total ?? 0) / 25));

    return variants
        .map((variant, idx) => {
            const distanceKm = polylineDistanceKm(variant.coords);
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
    const [routeLoading, setRouteLoading] = useState(false);

    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [searched, setSearched] = useState(false);
    const [selectedId, setSelectedId] = useState(1);
    const [routeOptions, setRouteOptions] = useState([]);
    const [startedRouteId, setStartedRouteId] = useState(null);

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

    const selectedRoute = routeOptions.find((r) => r.id === selectedId) || routeOptions[0] || null;
    const visibleRoutes = startedRouteId
        ? routeOptions.filter((route) => route.id === startedRouteId)
        : routeOptions;

    const handleSearch = async () => {
        if (!from || !to) return;

        const fromPlace = places.find((p) => p.id === from);
        const toPlace = places.find((p) => p.id === to);
        if (!fromPlace || !toPlace) return;

        setSearched(true);
        setRouteLoading(true);
        setLoadError('');
        setStartedRouteId(null);

        const nearestAccident = accidentWaypoints
            .map((acc) => ({
                ...acc,
                d: distancePointToSegmentKm(acc, { lat: fromPlace.lat, lng: fromPlace.lng }, { lat: toPlace.lat, lng: toPlace.lng }),
            }))
            .sort((a, b) => a.d - b.d)[0] || null;

        try {
            const osrmRoutes = await fetchOsrmRoutes(fromPlace, toPlace, nearestAccident);
            if (osrmRoutes.length > 0) {
                setRouteOptions(osrmRoutes);
                setSelectedId(osrmRoutes.some((route) => route.passesAccident) ? 3 : 1);
            } else {
                const fallbackRoutes = buildRouteVariants(fromPlace, toPlace, nearestAccident ? [nearestAccident] : [], vehicleCounts);
                setRouteOptions(fallbackRoutes);
                setSelectedId(fallbackRoutes.some((route) => route.passesAccident) ? 3 : 1);
            }
        } catch {
            const fallbackRoutes = buildRouteVariants(fromPlace, toPlace, nearestAccident ? [nearestAccident] : [], vehicleCounts);
            setRouteOptions(fallbackRoutes);
            setLoadError('Routing service unavailable, using fallback path.');
            setSelectedId(fallbackRoutes.some((route) => route.passesAccident) ? 3 : 1);
        } finally {
            setRouteLoading(false);
        }
    };

    const handleStart = route => {
        setSelectedId(route.id);
        setStartedRouteId(route.id);
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
                    {searched && visibleRoutes.map(route => (
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
                            {places.map(p => <option key={p.id} value={p.id}>{p.label} - {p.dashcam}</option>)}
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
                                .map(p => <option key={p.id} value={p.id}>{p.label} - {p.dashcam}</option>)}
                        </select>
                    </div>
                    <button className="planner-search-btn" onClick={handleSearch}>
                        Calculer les itinéraires →
                    </button>
                    {startedRouteId && (
                        <button
                            className="planner-locate-btn"
                            style={{ marginTop: 10, width: '100%' }}
                            onClick={() => setStartedRouteId(null)}
                        >
                            Afficher tous les itinéraires
                        </button>
                    )}
                    {loading && <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#5A6A7A' }}>Chargement des données trafic...</div>}
                    {loadError && <div style={{ marginTop: 10, fontSize: '0.8rem', color: '#B71C1C' }}>{loadError}</div>}
                </div>

                {searched && (
                    <div className="planner-results">
                        <div className="planner-results-title">{routeOptions.length} itinéraires disponibles</div>
                        {routeOptions.map(route => (
                            <RouteCard
                                key={route.id}
                                route={route}
                                selected={route.id === selectedId}
                                onStart={handleStart}
                            />
                        ))}
                        {routeLoading && (
                            <div className="planner-empty-text">Calcul d’un itinéraire réel sur les routes...</div>
                        )}
                        {!routeLoading && routeOptions.length === 0 && (
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
