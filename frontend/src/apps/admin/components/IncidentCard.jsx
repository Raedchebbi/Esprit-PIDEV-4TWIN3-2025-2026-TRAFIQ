import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../../shared/config/runtimeConfig';
import './IncidentCard.css';

export default function IncidentCard({ incident, compact, selectable, selected, onToggleSelect }) {
    const { id, type, severity, vehicles, conf, level, snapshot, timestamp, camera_id, false_positive } = incident;
    const [showSnapshot, setShowSnapshot] = useState(false);
    const navigate = useNavigate();

    const handleLocalise = () => {
        const cam = camera_id || 'cam0';
        navigate(`/admin/dashboard?cam=${cam}`);
    };

    return (
        <div className={`adm-incident-card s-${severity} ${selected ? 'adm-card-selected' : ''} ${false_positive ? 'adm-card-fp' : ''}`}>
            {selectable && (
                <label className="adm-card-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="checkbox"
                        checked={!!selected}
                        onChange={onToggleSelect}
                    />
                    <span className="adm-checkmark" />
                </label>
            )}
            <div className="adm-incident-header">
                <span className="adm-incident-type">
                    {false_positive && <span className="adm-fp-tag">FP</span>}
                    {type}
                </span>
                <span className="adm-incident-level">{level}</span>
            </div>

            <div className="adm-incident-main">
                <div className="adm-incident-vehicles">Véhicules {vehicles}</div>
                <div className="adm-incident-id">ID Incident : {id}</div>
                {timestamp && <div className="adm-incident-id">🕒 {timestamp}</div>}
            </div>

            <div className="adm-incident-meta">
                <div className="adm-meta-pill">Conf: {conf ? (conf * 100).toFixed(0) : 0}%</div>
            </div>

            {showSnapshot && snapshot && (
                <div className="adm-incident-snapshot">
                    <img
                        src={`${API_BASE_URL}/accidents/snapshot/${incident.snapshot}`}
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
                    <button className="adm-btn-secondary" onClick={handleLocalise}>📍 Localiser</button>
                </div>
            )}

            {compact && (
                <div className="adm-incident-mini-actions">
                    <button className="adm-icon-btn" onClick={() => setShowSnapshot(!showSnapshot)}>🔍</button>
                    <button className="adm-icon-btn" onClick={handleLocalise}>📍</button>
                </div>
            )}
        </div>
    );
}
