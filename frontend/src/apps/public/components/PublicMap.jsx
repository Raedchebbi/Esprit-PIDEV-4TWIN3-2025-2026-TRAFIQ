import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, Circle as CircleIcon, MapPin, Route } from 'lucide-react';
import { useTrafik } from '../../../shared/context/TrafikContext';
import { useProximity } from '../../../shared/hooks/useProximity';
import {
    MAP_DEFAULT_LAT,
    MAP_DEFAULT_LNG,
} from '../../../shared/config/runtimeConfig';

const userIcon = L.divIcon({
    html: `<div class="user-marker"><div class="user-marker-dot"></div><div class="user-marker-ring"></div></div>`,
    className: '', iconAnchor: [14, 14]
});

const accidentIcon = L.divIcon({
    html: `<div style="background:#E53935;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(229,57,53,0.5);animation:pulse 1.5s infinite"><span style="width:12px;height:12px;border-radius:999px;background:white;display:block"></span></div>`,
    className: '', iconAnchor: [14, 14]
});

function RecenterMap({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.setView(center, 15);
        }
    }, [map, center]);
    return null;
}

export default function PublicMap({ activeRoute, position, showProximityCircle }) {
    const { accidentsGPS } = useTrafik();
    const { nearby } = useProximity(position, accidentsGPS, 30);
    const [legendVisible, setLegendVisible] = useState(true);
    const [forcedCenter, setForcedCenter] = useState(null);

    useEffect(() => {
        const handleCenterEvent = (event) => {
            const { lat, lng } = event.detail || {};
            if (typeof lat === 'number' && typeof lng === 'number') {
                setForcedCenter([lat, lng]);
            }
        };

        window.addEventListener('trafiq-center-position', handleCenterEvent);
        return () => window.removeEventListener('trafiq-center-position', handleCenterEvent);
    }, []);

    const activeAccidents = accidentsGPS.filter(a => a.active).slice(0, 2);
    const mapCenter = activeRoute?.coords?.[0]
        || (position ? [position.lat, position.lng] : null)
        || [MAP_DEFAULT_LAT, MAP_DEFAULT_LNG];
    const center = forcedCenter || mapCenter;

    return (
        <div className="pub-map-container">
            <style>{`
        .pub-map-container { height: 100%; width: 100%; position: relative; }
        .user-marker { position:relative; width:28px; height:28px; }
        .user-marker-dot { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:12px; height:12px; background:#1A73E8; border-radius:50%; border:2px solid white; z-index:2; }
        .user-marker-ring { position:absolute; top:0; left:0; width:28px; height:28px; border:2px solid rgba(26,115,232,0.4); border-radius:50%; animation:ripple 2s ease-out infinite; }
        .leaflet-popup-content-wrapper { border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.15); }
      `}</style>

            <MapContainer
                center={center}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    maxZoom={19}
                />
                <RecenterMap center={mapCenter} />

                {/* Active route */}
                {activeRoute && (
                    <Polyline
                        positions={activeRoute.coords}
                        color={activeRoute.color}
                        weight={activeRoute.weight}
                        opacity={activeRoute.opacity}
                        dashArray={activeRoute.dashArray}
                        pathOptions={{ lineCap: 'round', lineJoin: 'round' }}
                    />
                )}

                {/* User position */}
                {position && (
                    <>
                        <Marker position={[position.lat, position.lng]} icon={userIcon}>
                            <Popup>Ma position</Popup>
                        </Marker>
                        {showProximityCircle && nearby.length > 0 && (
                            <Circle
                                center={[position.lat, position.lng]}
                                radius={30}
                                color="#1A73E8"
                                fillColor="#1A73E8"
                                fillOpacity={0.1}
                                weight={2}
                                dashArray="4,4"
                            />
                        )}
                    </>
                )}

                {/* Accidents */}
                {activeAccidents.map(acc => (
                    <React.Fragment key={acc.id}>
                        <Marker position={[acc.lat, acc.lng]} icon={accidentIcon}>
                            <Popup>
                                <div style={{ fontFamily: 'var(--font-body)', minWidth: 180 }}>
                                    <div style={{ fontWeight: 700, color: '#E53935', marginBottom: 4 }}>{acc.type}</div>
                                    <div style={{ fontSize: '0.8rem', color: '#5A6A7A' }}>Sévérité : <b>{acc.severity}</b></div>
                                    <div style={{ fontSize: '0.8rem', color: '#5A6A7A' }}>Score : {acc.score}</div>
                                </div>
                            </Popup>
                        </Marker>
                        <Circle
                            center={[acc.lat, acc.lng]}
                            radius={15}
                            color="#E53935"
                            fillColor="#E53935"
                            fillOpacity={0.15}
                            weight={2}
                        />
                    </React.Fragment>
                ))}
            </MapContainer>

            {/* Legend */}
            {legendVisible && (
                <div className="pub-map-legend">
                    <span><AlertTriangle size={14} aria-hidden="true" /> Accident</span>
                    <span><MapPin size={14} aria-hidden="true" /> Votre position</span>
                    <span><Route size={14} aria-hidden="true" /> Itinéraire actif</span>
                    <button onClick={() => setLegendVisible(false)}>Masquer</button>
                </div>
            )}
        </div>
    );
}
