import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Clock3, LocateFixed, Search } from 'lucide-react';
import { trafiqApi } from '../../../shared/services/trafiqApi';
import './IncidentCard.css';

export default function IncidentCard({ incident, compact, selectable, selected, onToggleSelect }) {
    const { id, type, severity, vehicles, conf, level, snapshot, timestamp, camera_id, false_positive } = incident;
    const [showSnapshot, setShowSnapshot] = useState(false);
    const [snapshotSrc, setSnapshotSrc] = useState(null);
    const [snapshotError, setSnapshotError] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        if (!showSnapshot || !snapshot) {
            setSnapshotSrc(null);
            setSnapshotError('');
            return undefined;
        }

        let active = true;
        let objectUrl = null;

        setSnapshotSrc(null);
        setSnapshotError('');

        trafiqApi
            .getSnapshotUrl(snapshot)
            .then((url) => {
                if (!active) {
                    URL.revokeObjectURL(url);
                    return;
                }

                objectUrl = url;
                setSnapshotSrc(url);
            })
            .catch(() => {
                if (active) {
                    setSnapshotSrc(null);
                    setSnapshotError('Impossible de charger le snapshot.');
                }
            });

        return () => {
            active = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [showSnapshot, snapshot]);

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
                {timestamp && <div className="adm-incident-id"><Clock3 size={12} aria-hidden="true" /> {timestamp}</div>}
            </div>

            <div className="adm-incident-meta">
                <div className="adm-meta-pill">Conf: {conf ? (conf * 100).toFixed(0) : 0}%</div>
            </div>

            {showSnapshot && snapshot && (
                <div className="adm-incident-snapshot">
                    {snapshotSrc ? (
                        <img
                            src={snapshotSrc}
                            alt="accident snapshot"
                            style={{ width: '100%', borderRadius: 8, marginTop: 8 }}
                        />
                    ) : snapshotError ? (
                        <div className="adm-incident-id" style={{ marginTop: 8 }}>{snapshotError}</div>
                    ) : (
                        <div className="adm-incident-id" style={{ marginTop: 8 }}>Chargement du snapshot...</div>
                    )}
                </div>
            )}

            {!compact && (
                <div className="adm-incident-actions">
                    <button
                        className="adm-btn-primary"
                        onClick={() => setShowSnapshot(!showSnapshot)}
                        disabled={!snapshot}
                    >
                        <Camera size={14} aria-hidden="true" />
                        Snapshot
                    </button>
                    <button className="adm-btn-secondary" onClick={handleLocalise}>
                        <LocateFixed size={14} aria-hidden="true" />
                        Localiser
                    </button>
                </div>
            )}

            {compact && (
                <div className="adm-incident-mini-actions">
                    <button className="adm-icon-btn" onClick={() => setShowSnapshot(!showSnapshot)} aria-label="Afficher le snapshot">
                        <Search size={14} aria-hidden="true" />
                    </button>
                    <button className="adm-icon-btn" onClick={handleLocalise} aria-label="Localiser l'incident">
                        <LocateFixed size={14} aria-hidden="true" />
                    </button>
                </div>
            )}
        </div>
    );
}
