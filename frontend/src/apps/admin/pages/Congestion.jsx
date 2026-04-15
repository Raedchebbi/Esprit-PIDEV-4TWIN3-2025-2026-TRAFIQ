import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trafiqApi } from '../../../shared/services/trafiqApi';
import './Congestion.css';

// ─── Congestion level based on live vehicle count ─────────────────────────────
function congestionLevel(count) {
    if (count >= 12) return { label: 'Saturé',  color: '#e53935', bg: 'rgba(229,57,53,0.12)' };
    if (count >= 7)  return { label: 'Dense',   color: '#FB8C00', bg: 'rgba(251,140,0,0.12)' };
    if (count >= 3)  return { label: 'Modéré',  color: '#FDD835', bg: 'rgba(253,216,53,0.12)' };
    return { label: 'Fluide', color: '#43A047', bg: 'rgba(67,160,71,0.12)' };
}

export default function Congestion() {
    const [sources, setSources] = useState([]);
    const [vehicleCounts, setVehicleCounts] = useState({ total: 0, per_camera: [] });
    const [incidents, setIncidents] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);
    const navigate = useNavigate();

    // Load camera sources from API
    useEffect(() => {
        trafiqApi.getCameras()
            .then(cams => setSources(cams.map(c => ({
                id: c.id,
                name: c.label,
                area: c.area || c.city || '',
            }))))
            .catch(() => {});
    }, []);

    // Poll live vehicle counts (fast)
    useEffect(() => {
        const load = () =>
            trafiqApi.getVehicleCounts()
                .then(data => {
                    setVehicleCounts(data);
                    setLastUpdated(new Date().toLocaleTimeString());
                })
                .catch(() => {});
        load();
        const iv = setInterval(load, 2000);
        return () => clearInterval(iv);
    }, []);

    // Poll active incidents for incident count per zone
    useEffect(() => {
        const load = () =>
            trafiqApi.getActiveAccidents().then(setIncidents).catch(() => {});
        load();
        const iv = setInterval(load, 10000);
        return () => clearInterval(iv);
    }, []);

    // Build per-camera count map
    const camCounts = (vehicleCounts.per_camera || []).reduce((acc, c) => {
        acc[c.cam_id] = c.count;
        return acc;
    }, {});

    const zoneStats = sources.map(src => {
        const count = camCounts[src.id] ?? 0;
        const cong = congestionLevel(count);
        const zoneIncidents = incidents.filter(i => i.camera_id === src.id).length;
        return { ...src, vehicleCount: count, congestion: cong, incidents: zoneIncidents };
    });

    const totalVehicles = vehicleCounts.total || 0;
    const congestedZones = zoneStats.filter(z => z.vehicleCount >= 7).length;
    const freeZones = zoneStats.filter(z => z.vehicleCount < 3).length;

    return (
        <div className="adm-cong-page">
            {/* Header */}
            <div className="adm-cong-header">
                <div>
                    <h2>Congestion en temps réel</h2>
                    <p className="adm-cong-sub">
                        Densité du trafic par zone · Mise à jour : {lastUpdated || '—'}
                    </p>
                </div>
            </div>

            {/* Summary cards */}
            <div className="adm-cong-summary">
                <div className="adm-cong-sum-card">
                    <span className="adm-cong-sum-val">{totalVehicles}</span>
                    <span className="adm-cong-sum-label">Véhicules détectés</span>
                </div>
                <div className="adm-cong-sum-card">
                    <span className="adm-cong-sum-val">{sources.length}</span>
                    <span className="adm-cong-sum-label">Zones surveillées</span>
                </div>
                <div className={`adm-cong-sum-card ${congestedZones > 0 ? 'urgent' : ''}`}>
                    <span className="adm-cong-sum-val">{congestedZones}</span>
                    <span className="adm-cong-sum-label">Zones congestionnées</span>
                </div>
                <div className="adm-cong-sum-card">
                    <span className="adm-cong-sum-val">{freeZones}</span>
                    <span className="adm-cong-sum-label">Zones fluides</span>
                </div>
            </div>

            {/* Zone congestion cards */}
            <div className="adm-cong-zones">
                {zoneStats.map(zone => (
                    <div
                        key={zone.id}
                        className="adm-cong-zone-card"
                        style={{ borderLeft: `4px solid ${zone.congestion.color}` }}
                    >
                        <div className="adm-cong-zone-top">
                            <div className="adm-cong-zone-info">
                                <div>
                                    <div className="adm-cong-zone-name">{zone.name}</div>
                                    <div className="adm-cong-zone-cam">📹 {zone.area}</div>
                                </div>
                            </div>
                            <span
                                className="adm-cong-risk-badge"
                                style={{ color: zone.congestion.color, background: zone.congestion.bg }}
                            >
                                {zone.congestion.label}
                            </span>
                        </div>

                        {/* Density bar */}
                        <div className="adm-cong-bar-wrap">
                            <div className="adm-cong-bar-track">
                                <div
                                    className="adm-cong-bar-fill"
                                    style={{
                                        width: `${Math.min(zone.vehicleCount / 15 * 100, 100)}%`,
                                        background: zone.congestion.color,
                                    }}
                                />
                            </div>
                            <span className="adm-cong-bar-val">{zone.vehicleCount} véh.</span>
                        </div>

                        {/* Stats row */}
                        <div className="adm-cong-zone-stats">
                            <div className="adm-cong-stat">
                                <span className="adm-cong-stat-label">Véhicules en temps réel</span>
                                <span className="adm-cong-stat-val">{zone.vehicleCount}</span>
                            </div>
                            <div className="adm-cong-stat">
                                <span className="adm-cong-stat-label">Incidents actifs</span>
                                <span className="adm-cong-stat-val">{zone.incidents}</span>
                            </div>
                        </div>

                        {/* Locate on map */}
                        <button
                            className="adm-btn-primary"
                            style={{ width: '100%', marginTop: 8 }}
                            onClick={() => navigate(`/admin/dashboard?cam=${zone.id}`)}
                        >
                            🗺 Localiser sur la carte
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}