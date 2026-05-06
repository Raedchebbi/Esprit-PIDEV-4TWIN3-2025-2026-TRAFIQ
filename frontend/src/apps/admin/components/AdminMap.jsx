import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import { CarFront, Video } from 'lucide-react';
import { trafiqApi } from '../../../shared/services/trafiqApi';

// ─── Risk scoring (shown in popup stats) ──────────────────────────────────────

// How many minutes before an incident is considered "stale"
const STALE_MINUTES = 10;

function computeZoneRisk(incidents, vehicleCount = 0) {
    // Base density score from live vehicle count (0-30 pts)
    const densityScore = Math.min(vehicleCount / 15, 1) * 30;

    if (!incidents || incidents.length === 0) {
        // No incidents — risk comes only from congestion density
        const score = Math.round(densityScore);
        if (score >= 20) return { score, color: '#FDD835', label: 'Surveillance', pulse: false };
        return { score, color: '#43A047', label: 'Normal', pulse: false };
    }

    const now = Date.now();
    const recentIncidents = incidents.filter(inc => {
        if (!inc.timestamp) return true;
        const ts = new Date(inc.timestamp).getTime();
        return (now - ts) < STALE_MINUTES * 60 * 1000;
    });

    const best = recentIncidents.length > 0 ? recentIncidents[0] : incidents[0];
    const aiRisk = best.risk_score ?? null;
    const incidentScore = aiRisk !== null
        ? Math.round(aiRisk * 100)
        : Math.round((best.iou || 0) * 50 + (best.confidence || 0) * 50);

    // Blend: incident risk (70%) + density (30%)
    const score = Math.min(100, Math.round(incidentScore * 0.7 + densityScore));
    const isRecent = recentIncidents.length > 0;

    if (score >= 70 || (best.risk_level === 'CRITICAL' && isRecent))
        return { score, color: '#e53935', label: 'Accident détecté', pulse: true };
    if (score >= 40 || (best.risk_level === 'HIGH' && isRecent))
        return { score, color: '#FB8C00', label: 'Risque modéré',  pulse: false };
    if (isRecent)
        return { score, color: '#FDD835', label: 'Surveillance',    pulse: false };
    return { score, color: '#43A047', label: 'Normal', pulse: false };
}

// ─── Congestion scoring (used for map circle colors) ──────────────────────────
function computeCongestion(vehicleCount) {
    if (vehicleCount >= 12) return { level: 'Saturé',  color: '#e53935' };
    if (vehicleCount >= 7)  return { level: 'Dense',   color: '#FB8C00' };
    if (vehicleCount >= 3)  return { level: 'Modéré',  color: '#FDD835' };
    return { level: 'Fluide', color: '#43A047' };
}

const cityIcon = (color, count, label) => L.divIcon({
    html: `<div style="
        background:${color};color:#fff;font-size:0.65rem;font-weight:800;
        padding:4px 8px;border-radius:12px;white-space:nowrap;
        box-shadow:0 0 12px ${color};border:1.5px solid rgba(255,255,255,0.3);
    ">${count > 0 ? `${count} incident${count>1?'s':''}` : label || 'Normal'}</div>`,
    className: '', iconAnchor: [30, 14],
});

// ─── Transform API camera data into zone objects for the map ──────────────────
function camerasToZones(cameras) {
    return cameras.map(cam => ({
        id: cam.id,
        name: cam.label,
        city: cam.city || cam.area || '',
        center: [cam.location.latitude, cam.location.longitude],
        mediaSrc: cam.media_url || cam.stream_url || '',
        mediaType: cam.media_type || 'video',
    }));
}

// ─── Auto-focus helper: fly to zone and open its popup ───────────────────────
function FocusOnZone({ targetCenter, markerRefs }) {
    const map = useMap();
    const targetKey = targetCenter ? `${targetCenter[0]},${targetCenter[1]}` : null;

    useEffect(() => {
        if (!targetCenter || !targetKey) return;

        map.flyTo(targetCenter, 14, { duration: 1.2 });

        let tries = 0;
        const tryOpenPopup = () => {
            const marker = markerRefs.current[targetKey];
            if (marker) {
                marker.openPopup();
                return;
            }
            tries += 1;
            if (tries < 10) {
                setTimeout(tryOpenPopup, 200);
            }
        };

        const timer = setTimeout(tryOpenPopup, 1200);
        return () => clearTimeout(timer);
    }, [targetCenter, targetKey, map, markerRefs]);

    return null;
}

export default function AdminMap() {
    const [zones, setZones] = useState([]);
    const [aiIncidents, setAiIncidents] = useState([]);
    const [vehicleCounts, setVehicleCounts] = useState({ total: 0, per_camera: [] });
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const focusCam = searchParams.get('cam');
    const focusZone = zones.find(z => z.id === focusCam);
    const markerRefs = useRef({});

    // Load cameras once from the API
    useEffect(() => {
        trafiqApi.getCameras()
            .then(cams => setZones(camerasToZones(cams)))
            .catch(() => {});
    }, []);

    // Poll incidents (active only — excludes false positives)
    useEffect(() => {
        const load = () =>
            trafiqApi.getActiveAccidents().then(setAiIncidents).catch(console.error);
        load();
        const iv = setInterval(load, 3_000);
        return () => clearInterval(iv);
    }, []);

    // Poll live vehicle counts (fast refresh)
    useEffect(() => {
        const load = () =>
            trafiqApi.getVehicleCounts().then(setVehicleCounts).catch(() => {});
        load();
        const iv = setInterval(load, 2000);
        return () => clearInterval(iv);
    }, []);

    // Route incidents to zones by camera_id from AI engine
    const zoneIncidents = zones.reduce((acc, zone) => {
        acc[zone.id] = aiIncidents.filter(inc => inc.camera_id === zone.id);
        return acc;
    }, {});

    // Map cam_id → live vehicle count
    const camVehicleCount = (vehicleCounts.per_camera || []).reduce((acc, c) => {
        acc[c.cam_id] = c.count;
        return acc;
    }, {});

    return (
        <div style={{ height: '100%', width: '100%' }}>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
            <MapContainer
                center={[20, 10]}
                zoom={2}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png"
                    attribution='&copy; OpenStreetMap &copy; CartoDB'
                />
                {focusZone && (
                    <FocusOnZone
                        targetCenter={focusZone.center}
                        markerRefs={markerRefs}
                    />
                )}

                {/* ── Zone summary markers ── */}
                {zones.map(zone => {
                    const incidents   = zoneIncidents[zone.id] || [];
                    const liveVehicles = camVehicleCount[zone.id] ?? 0;
                    const congestion  = computeCongestion(liveVehicles);
                    const risk        = computeZoneRisk(incidents, liveVehicles);
                    const latest      = incidents[0];

                    return (
                        <React.Fragment key={zone.id}>
                            {/* City summary badge — colored by congestion */}
                            <Marker
                                position={zone.center}
                                icon={cityIcon(congestion.color, incidents.length, congestion.level)}
                                ref={el => { if (el) markerRefs.current[`${zone.center[0]},${zone.center[1]}`] = el; }}
                            >
                                <Popup minWidth={320} maxWidth={380}>
                                    <div style={{ fontSize: '0.82rem', minWidth: 300 }}>
                                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{zone.name}</div>
                                        <div style={{ opacity: 0.6, marginBottom: 8 }}>{zone.city}</div>

                                        {/* Media embed */}
                                        {zone.mediaType === 'video' ? (
                                            <video
                                                src={zone.mediaSrc}
                                                autoPlay muted loop playsInline controls preload="auto"
                                                style={{
                                                    width: '100%', height: 180,
                                                    borderRadius: 8, background: '#000', marginBottom: 8,
                                                    objectFit: 'cover',
                                                }}
                                            />
                                        ) : (
                                            <iframe
                                                src={zone.mediaSrc}
                                                title={`Live — ${zone.name}`}
                                                style={{
                                                    width: '100%', height: 180, border: 'none',
                                                    borderRadius: 8, background: '#000', marginBottom: 8,
                                                }}
                                                allow="autoplay; encrypted-media"
                                                allowFullScreen
                                            />
                                        )}

                                        {/* Congestion level */}
                                        <div style={{ color: congestion.color, fontWeight: 700, marginBottom: 4 }}>
                                            Congestion : {congestion.level}
                                        </div>

                                        {/* Live vehicle count */}
                                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                                            Véhicules détectés : {liveVehicles}
                                        </div>

                                        {/* Risk assessment stats */}
                                        <div style={{ color: risk.color, fontWeight: 700, marginBottom: 6 }}>
                                            {risk.label} — Risk Score {risk.score}/100
                                        </div>
                                        <div style={{ marginBottom: 8 }}>
                                            {incidents.length} incident(s) détecté(s)
                                        </div>
                                        {latest && (
                                            <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: 8 }}>
                                                Dernier : {latest.timestamp}<br/>
                                                Véhicules #{latest.vehicle_a} → #{latest.vehicle_b}<br/>
                                                {latest.angles_agreed && (
                                                    <span>Angles confirmés : {latest.angles_agreed.join(', ')}</span>
                                                )}
                                            </div>
                                        )}
                                        <button
                                            style={{
                                                width: '100%', padding: '6px',
                                                background: congestion.color, color: '#fff',
                                                border: 'none', borderRadius: 6,
                                                cursor: 'pointer', fontWeight: 700,
                                            }}
                                            onClick={() => navigate('/admin/live')}
                                        >
                                            Voir flux live
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>

                            {/* Zone congestion circle */}
                            <Circle
                                key={`${zone.id}-circle-${congestion.color}`}
                                center={zone.center}
                                radius={300}
                                pathOptions={{
                                    color: congestion.color,
                                    fillColor: congestion.color,
                                    fillOpacity: 0.12,
                                    weight: 2,
                                }}
                            />

                        </React.Fragment>
                    );
                })}
            </MapContainer>
        </div>
    );
}
