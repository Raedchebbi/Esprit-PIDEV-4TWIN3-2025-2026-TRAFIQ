import React, { useState } from 'react';
import './IncidentCard.css';

export default function IncidentCard({ incident, compact }) {
    const { id, type, severity, vehicles, score, conf, level, snapshot, timestamp } = incident;
    const [showSnapshot, setShowSnapshot] = useState(false);

    return (
        <div className={`adm-incident-card s-${severity}`}>
            <div className="adm-incident-header">
                <span className="adm-incident-type">{type}</span>
                <span className="adm-incident-level">{level}</span>
            </div>

            <div className="adm-incident-main">
                <div className="adm-incident-vehicles">Véhicules {vehicles}</div>
                <div className="adm-incident-id">ID Incident : {id}</div>
                {timestamp && <div className="adm-incident-id">🕒 {timestamp}</div>}
            </div>

            <div className="adm-incident-meta">
                <div className="adm-meta-pill">Score: {score}</div>
                <div className="adm-meta-pill">Conf: {conf ? (conf * 100).toFixed(0) : 0}%</div>
            </div>

            {showSnapshot && snapshot && (
                <div className="adm-incident-snapshot">
                    <img
                        src={`http://localhost:3000/snapshots/${snapshot.replace('snapshots/', '')}`}
                        alt="accident snapshot"
                        style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
                    />
                </div>
            )}

            {!compact && (
                <div className="adm-incident-actions">
                    <button
                        className="adm-btn-primary"
                        onClick={() => setShowSnapshot(!showSnapshot)}
                        disabled={!snapshot}
                    >
                        📷 Snapshot
                    </button>
                    <button className="adm-btn-secondary">📍 Localiser</button>
                </div>
            )}

            {compact && (
                <div className="adm-incident-mini-actions">
                    <button className="adm-icon-btn" onClick={() => setShowSnapshot(!showSnapshot)}>🔍</button>
                    <button className="adm-icon-btn">📍</button>
                </div>
            )}
        </div>
    );
}