import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';

// ─── Risk scoring ─────────────────────────────────────────────────────────────

// How many minutes before an incident is considered "stale"
const STALE_MINUTES = 10;

function computeZoneRisk(incidents) {
    if (!incidents || incidents.length === 0)
        return { score: 0, color: '#43A047', label: 'Normal', pulse: false };

    const now = Date.now();
    // Check if any incident is recent (within STALE_MINUTES)
    const recentIncidents = incidents.filter(inc => {
        if (!inc.timestamp) return true; // no timestamp → treat as recent
        const ts = new Date(inc.timestamp).getTime();
        return (now - ts) < STALE_MINUTES * 60 * 1000;
    });

    // Use risk_score from AI if available, otherwise compute from iou+confidence
    const best = recentIncidents.length > 0 ? recentIncidents[0] : incidents[0];
    const aiRisk = best.risk_score ?? null;
    const score = aiRisk !== null
        ? Math.round(aiRisk * 100)
        : Math.round((best.iou || 0) * 50 + (best.confidence || 0) * 50);

    const isRecent = recentIncidents.length > 0;

    if (score >= 70 || (best.risk_level === 'CRITICAL' && isRecent))
        return { score, color: '#e53935', label: 'Accident détecté', pulse: true };
    if (score >= 40 || (best.risk_level === 'HIGH' && isRecent))
        return { score, color: '#FB8C00', label: 'Risque modéré',  pulse: false };
    if (isRecent)
        return { score, color: '#FDD835', label: 'Surveillance',    pulse: false };
    // Stale incidents only
    return { score, color: '#43A047', label: 'Normal', pulse: false };
}

// ─── Dynamic marker icon ──────────────────────────────────────────────────────
const riskIcon = (color, pulse) => L.divIcon({
    html: `<div style="
        width:18px;height:18px;border-radius:50%;
        background:${color};border:2px solid rgba(255,255,255,0.8);
        box-shadow:0 0 ${pulse?'14px':'6px'} ${color};
        ${pulse?'animation:pulse 1s infinite;':''}
    "></div>`,
    className: '', iconAnchor: [9, 9],
});

const cityIcon = (color, count, label) => L.divIcon({
    html: `<div style="
        background:${color};color:#fff;font-size:0.65rem;font-weight:800;
        padding:4px 8px;border-radius:12px;white-space:nowrap;
        box-shadow:0 0 12px ${color};border:1.5px solid rgba(255,255,255,0.3);
    ">${count > 0 ? `${count} incident${count>1?'s':''}` : label || 'Normal'}</div>`,
    className: '', iconAnchor: [30, 14],
});

// ─── Zone definitions ─────────────────────────────────────────────────────────
const ZONES = [
    {
        id: 'cam0',
        name: 'Dashcam 1 — accident.mp4',
        city: 'France 🇫🇷',
        center: [47.79524, 2.19883],
        mediaSrc: '/videos/accident.mp4',
        mediaType: 'video',
    },
    {
        id: 'cam1',
        name: 'Dashcam 2 — accident0.mp4',
        city: 'Spain 🇪🇸',
        center: [42.583428, -5.818252],
        mediaSrc: '/videos/accident0.mp4',
        mediaType: 'video',
    },
    {
        id: 'cam2',
        name: 'Астрахань, Боевая, 45',
        city: 'Astrakhan, Russia 🇷🇺',
        center: [46.336341, 48.022568],
        mediaSrc: 'https://webcams.windy.com/webcams/public/embed/player/1625695244/live',
        mediaType: 'iframe',
    },
    {
        id: 'cam3',
        name: 'Aстрахань, Боевая, 36',
        city: 'Astrakhan, Russia 🇷🇺',
        center: [46.338579, 48.020937],
        mediaSrc: 'https://webcams.windy.com/webcams/public/embed/player/1625695351/live',
        mediaType: 'iframe',
    },
    {
        id: 'cam4',
        name: 'Астрахань, Богдана Хмельницкого, 17',
        city: 'Astrakhan, Russia 🇷🇺',
        center: [46.33642, 48.02928],
        mediaSrc: 'https://webcams.windy.com/webcams/public/embed/player/1625695315/live',
        mediaType: 'iframe',
    },
];

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
    const [aiIncidents, setAiIncidents] = useState([]);
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const focusCam = searchParams.get('cam');
    const focusZone = ZONES.find(z => z.id === focusCam);
    const markerRefs = useRef({});

    useEffect(() => {
        fetch('http://localhost:3000/accidents')
            .then(r => r.json())
            .then(setAiIncidents)
            .catch(() => {});

        const iv = setInterval(() => {
            fetch('http://localhost:3000/accidents')
                .then(r => r.json())
                .then(setAiIncidents)
                .catch(() => {});
        }, 10_000);
        return () => clearInterval(iv);
    }, []);

    // Route incidents to zones by camera_id from AI engine
    const zoneIncidents = ZONES.reduce((acc, zone) => {
        acc[zone.id] = aiIncidents.filter(inc => inc.camera_id === zone.id);
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
                {ZONES.map(zone => {
                    const incidents = zoneIncidents[zone.id] || [];
                    const risk      = computeZoneRisk(incidents);
                    const latest    = incidents[0];

                    return (
                        <React.Fragment key={zone.id}>
                            {/* City summary badge */}
                            <Marker
                                position={zone.center}
                                icon={cityIcon(risk.color, incidents.length, risk.label)}
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

                                        <div style={{ color: risk.color, fontWeight: 700, marginBottom: 6 }}>
                                            {risk.label} — Score {risk.score}/100
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
                                                background: risk.color, color: '#fff',
                                                border: 'none', borderRadius: 6,
                                                cursor: 'pointer', fontWeight: 700,
                                            }}
                                            onClick={() => navigate('/admin/live')}
                                        >
                                            📹 Voir flux live
                                        </button>
                                    </div>
                                </Popup>
                            </Marker>

                            {/* Zone risk circle */}
                            <Circle
                                center={zone.center}
                                radius={300}
                                color={risk.color}
                                fillOpacity={0.07}
                                weight={1.5}
                            />

                        </React.Fragment>
                    );
                })}
            </MapContainer>
        </div>
    );
}