import React, { useEffect, useState } from 'react';
import './Congestion.css';

// ─── Risk score calculator ────────────────────────────────────────────────────
// Uses real data from the AI engine (iou + confidence) to compute a risk score
// Score 0-100: <30 = low, 30-60 = medium, >60 = high
function computeRisk(iou = 0, confidence = 0, vehicleCount = 0) {
    const iouScore       = iou * 40;          // IoU contributes up to 40 pts
    const confScore      = confidence * 30;   // Confidence contributes up to 30 pts
    const densityScore   = Math.min(vehicleCount / 20, 1) * 30; // Density up to 30 pts
    return Math.round(iouScore + confScore + densityScore);
}

function riskLevel(score) {
    if (score >= 60) return { label: 'Élevé', color: '#e53935', bg: 'rgba(229,57,53,0.12)' };
    if (score >= 30) return { label: 'Modéré', color: '#FB8C00', bg: 'rgba(251,140,0,0.12)' };
    return { label: 'Faible', color: '#43A047', bg: 'rgba(67,160,71,0.12)' };
}

const SOURCES = [
    { id: 'cam0', name: '47.79524, 2.19883 — France', camera: 'France', flag: '🇫🇷' },
    { id: 'cam1', name: '42.583428, -5.818252 — Spain', camera: 'Spain', flag: '🇪🇸' },
    { id: 'cam2', name: 'Астрахань, Боевая, 45', camera: 'Live stream', flag: '🇷🇺' },
    { id: 'cam3', name: 'Aстрахань, Боевая, 36', camera: 'Live stream', flag: '🇷🇺' },
    { id: 'cam4', name: 'Астрахань, Богдана Хмельницкого, 17', camera: 'Live stream', flag: '🇷🇺' },
];

export default function Congestion() {
    const [incidents, setIncidents] = useState([]);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Fetch real incidents from the NestJS backend
    useEffect(() => {
        fetch('http://localhost:3000/accidents')
            .then(res => res.json())
            .then(data => {
                setIncidents(data);
                setLastUpdated(new Date().toLocaleTimeString());
            })
            .catch(() => {});

        // Refresh every 30 seconds
        const interval = setInterval(() => {
            fetch('http://localhost:3000/accidents')
                .then(res => res.json())
                .then(data => {
                    setIncidents(data);
                    setLastUpdated(new Date().toLocaleTimeString());
                })
                .catch(() => {});
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    const sourceStats = SOURCES.map((source) => {
        const sourceIncidents = incidents.filter((inc) => inc.camera_id === source.id);
        const latest = sourceIncidents[0];
        const vehicleIds = new Set();
        sourceIncidents.forEach((inc) => {
            if (inc.vehicle_a !== undefined && inc.vehicle_a !== null && inc.vehicle_a !== -1) vehicleIds.add(inc.vehicle_a);
            if (inc.vehicle_b !== undefined && inc.vehicle_b !== null && inc.vehicle_b !== -1) vehicleIds.add(inc.vehicle_b);
        });

        const vehicleCount = vehicleIds.size;
        const directRiskScore = latest?.risk_score !== undefined
            ? Math.round(Number(latest.risk_score) * 100)
            : null;
        const score = directRiskScore ?? computeRisk(
            latest?.iou || 0,
            latest?.confidence || 0,
            vehicleCount
        );
        const risk = riskLevel(score);

        return {
            ...source,
            score,
            risk,
            vehicleCount,
            incidents: sourceIncidents.length,
            latest,
        };
    });

    const totalIncidents = incidents.length;
    const highRiskZones  = sourceStats.filter(z => z.score >= 60).length;
    const avgConf        = incidents.length
        ? Math.round(incidents.reduce((s, i) => s + (i.confidence || 0), 0) / incidents.length * 100)
        : 0;

    return (
        <div className="adm-cong-page">
            {/* Header */}
            <div className="adm-cong-header">
                <div>
                    <h2>Analyse de Congestion</h2>
                    <p className="adm-cong-sub">
                        Évaluation des risques par zone · Dernière mise à jour : {lastUpdated || '—'}
                    </p>
                </div>
                <button
                    className="adm-btn-primary"
                    onClick={() => window.location.reload()}
                >
                    🔄 Actualiser
                </button>
            </div>

            {/* Summary cards */}
            <div className="adm-cong-summary">
                <div className="adm-cong-sum-card">
                    <span className="adm-cong-sum-val">{totalIncidents}</span>
                    <span className="adm-cong-sum-label">Incidents détectés</span>
                </div>
                <div className="adm-cong-sum-card urgent">
                    <span className="adm-cong-sum-val">{highRiskZones}</span>
                    <span className="adm-cong-sum-label">Zones à risque élevé</span>
                </div>
                <div className="adm-cong-sum-card">
                    <span className="adm-cong-sum-val">{avgConf}%</span>
                    <span className="adm-cong-sum-label">Confiance IA moyenne</span>
                </div>
                <div className="adm-cong-sum-card">
                    <span className="adm-cong-sum-val">{SOURCES.length}</span>
                    <span className="adm-cong-sum-label">Sources surveillées</span>
                </div>
            </div>

            {/* Zone risk cards */}
            <div className="adm-cong-zones">
                {sourceStats.map(zone => (
                    <div
                        key={zone.id}
                        className="adm-cong-zone-card"
                        style={{ borderLeft: `4px solid ${zone.risk.color}` }}
                    >
                        <div className="adm-cong-zone-top">
                            <div className="adm-cong-zone-info">
                                <span className="adm-cong-zone-flag">{zone.flag}</span>
                                <div>
                                    <div className="adm-cong-zone-name">{zone.name}</div>
                                    <div className="adm-cong-zone-cam">📹 {zone.camera}</div>
                                </div>
                            </div>
                            <span
                                className="adm-cong-risk-badge"
                                style={{ color: zone.risk.color, background: zone.risk.bg }}
                            >
                                {zone.risk.label}
                            </span>
                        </div>

                        {/* Risk score bar */}
                        <div className="adm-cong-bar-wrap">
                            <div className="adm-cong-bar-track">
                                <div
                                    className="adm-cong-bar-fill"
                                    style={{
                                        width: `${zone.score}%`,
                                        background: zone.risk.color,
                                    }}
                                />
                            </div>
                            <span className="adm-cong-bar-val">{zone.score}/100</span>
                        </div>

                        {/* Stats row */}
                        <div className="adm-cong-zone-stats">
                            <div className="adm-cong-stat">
                                <span className="adm-cong-stat-label">Véhicules estimés</span>
                                <span className="adm-cong-stat-val">{zone.vehicleCount}</span>
                            </div>
                            <div className="adm-cong-stat">
                                <span className="adm-cong-stat-label">Incidents</span>
                                <span className="adm-cong-stat-val">{zone.incidents}</span>
                            </div>
                            {zone.latest && (
                                <>
                                    <div className="adm-cong-stat">
                                        <span className="adm-cong-stat-label">IoU dernier</span>
                                        <span className="adm-cong-stat-val">{(zone.latest.iou * 100).toFixed(0)}%</span>
                                    </div>
                                    <div className="adm-cong-stat">
                                        <span className="adm-cong-stat-label">Confiance</span>
                                        <span className="adm-cong-stat-val">{(zone.latest.confidence * 100).toFixed(0)}%</span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Last incident */}
                        {zone.latest && (
                            <div className="adm-cong-last">
                                🕒 Dernier incident : {zone.latest.timestamp} —
                                Véhicules #{zone.latest.vehicle_a} & #{zone.latest.vehicle_b}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}