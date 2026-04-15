import React, { useEffect, useState, useCallback } from 'react';
import IncidentCard from '../components/IncidentCard';
import { trafiqApi } from '../../../shared/services/trafiqApi';
import './Incidents.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Incidents() {
    const [aiIncidents, setAiIncidents] = useState([]);
    const [selected, setSelected] = useState(new Set());

    const load = useCallback(() => {
        trafiqApi.getAccidents()
            .then(data => {
                const mapped = data.map((log) => ({
                    id: log.incident_id,
                    type: 'Collision',
                    severity: 'high',
                    vehicles: `#${log.vehicle_a} → #${log.vehicle_b}`,
                    conf: log.confidence || 0,
                    level: log.risk_level || 'L3',
                    timestamp: log.timestamp,
                    snapshot: log.snapshot,
                    camera_id: log.camera_id,
                    active: !log.false_positive,
                    false_positive: !!log.false_positive,
                }));
                setAiIncidents(mapped);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        load();
        const iv = setInterval(load, 10000);
        return () => clearInterval(iv);
    }, [load]);

    const toggleSelect = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAll = (ids) => {
        setSelected(prev => {
            const next = new Set(prev);
            const allSelected = ids.every(id => next.has(id));
            if (allSelected) ids.forEach(id => next.delete(id));
            else ids.forEach(id => next.add(id));
            return next;
        });
    };

    const handleFlag = async () => {
        if (selected.size === 0) return;
        const ids = [...selected];
        await fetch(`${API_BASE}/accidents/flag`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        setSelected(new Set());
        load();
    };

    const handleUnflag = async () => {
        if (selected.size === 0) return;
        const ids = [...selected];
        await fetch(`${API_BASE}/accidents/unflag`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        setSelected(new Set());
        load();
    };

    const handleRemove = async () => {
        if (selected.size === 0) return;
        const ids = [...selected];
        await fetch(`${API_BASE}/accidents/remove`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        setSelected(new Set());
        load();
    };

    const allIncidents = aiIncidents;
    const activeIncidents = allIncidents.filter(a => a.active);
    const fpIncidents = allIncidents.filter(a => a.false_positive);

    return (
        <div className="adm-incidents-page">
            <div className="adm-incidents-header">
                <div className="adm-incidents-title">
                    <h2>Gestion des Incidents</h2>
                    <div className="adm-incidents-summary">
                        <span className="adm-badge-red">{activeIncidents.length} actifs</span>
                        {fpIncidents.length > 0 && (
                            <span className="adm-badge-orange">{fpIncidents.length} faux positifs</span>
                        )}
                    </div>
                </div>
                <div className="adm-incidents-filters">
                    {selected.size > 0 && (
                        <div className="adm-selection-actions">
                            <span className="adm-selection-count">{selected.size} sélectionné(s)</span>
                            {/* Show flag button if any selected item is active */}
                            {[...selected].some(id => activeIncidents.find(a => a.id === id)) && (
                                <button className="adm-btn-warning" onClick={handleFlag}>
                                    🚫 Faux positif
                                </button>
                            )}
                            {/* Show unflag button if any selected item is a false positive */}
                            {[...selected].some(id => fpIncidents.find(a => a.id === id)) && (
                                <button className="adm-btn-primary" onClick={handleUnflag}>
                                    ✅ Rétablir
                                </button>
                            )}
                            <button className="adm-btn-danger" onClick={handleRemove}>
                                🗑 Supprimer
                            </button>
                            <button className="adm-btn-ghost" onClick={() => setSelected(new Set())}>
                                ✕ Annuler
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="adm-incidents-list">
                <div className="adm-section-head">
                    <h3>Incidents Actifs</h3>
                    {activeIncidents.length > 0 && (
                        <button
                            className="adm-btn-ghost adm-btn-sm"
                            onClick={() => selectAll(activeIncidents.map(a => a.id))}
                        >
                            {activeIncidents.every(a => selected.has(a.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                        </button>
                    )}
                </div>
                <div className="adm-incidents-grid">
                    {activeIncidents.map(acc => (
                        <IncidentCard
                            key={acc.id}
                            incident={acc}
                            selectable
                            selected={selected.has(acc.id)}
                            onToggleSelect={() => toggleSelect(acc.id)}
                        />
                    ))}
                    {activeIncidents.length === 0 && (
                        <p className="adm-empty-text">Aucun incident actif.</p>
                    )}
                </div>

                {fpIncidents.length > 0 && (
                    <>
                        <div className="adm-section-head adm-mt-32">
                            <h3>Faux Positifs</h3>
                            <button
                                className="adm-btn-ghost adm-btn-sm"
                                onClick={() => selectAll(fpIncidents.map(a => a.id))}
                            >
                                {fpIncidents.every(a => selected.has(a.id)) ? 'Tout désélectionner' : 'Tout sélectionner'}
                            </button>
                        </div>
                        <div className="adm-incidents-grid archived">
                            {fpIncidents.map(acc => (
                                <IncidentCard
                                    key={acc.id}
                                    incident={acc}
                                    selectable
                                    selected={selected.has(acc.id)}
                                    onToggleSelect={() => toggleSelect(acc.id)}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}