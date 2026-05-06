import React, { useEffect, useState, useCallback } from 'react';
import { Ban, Check, Trash2, X } from 'lucide-react';
import IncidentCard from '../components/IncidentCard';
import { trafiqApi } from '../../../shared/services/trafiqApi';
import './Incidents.css';


export default function Incidents() {
    const [aiIncidents, setAiIncidents] = useState([]);
    const [selected, setSelected] = useState(new Set());

    const load = useCallback(() => {
        Promise.all([trafiqApi.getAccidents(), trafiqApi.getActiveAccidents()])
            .then(([allData, activeData]) => {
                const activeIds = new Set(
                    Array.isArray(activeData)
                        ? activeData.map((log) => log.incident_id)
                        : [],
                );

                const mapped = (Array.isArray(allData) ? allData : []).map((log) => ({
                    id: log.incident_id,
                    type: 'Collision',
                    severity: 'high',
                    vehicles: `#${log.vehicle_a} → #${log.vehicle_b}`,
                    conf: log.confidence || 0,
                    level: log.risk_level || 'L3',
                    timestamp: log.timestamp,
                    snapshot: log.snapshot,
                    camera_id: log.camera_id,
                    active: activeIds.has(log.incident_id),
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
        await trafiqApi.flagIncidents(ids);
        setSelected(new Set());
        load();
    };

    const handleUnflag = async () => {
        if (selected.size === 0) return;
        const ids = [...selected];
        await trafiqApi.unflagIncidents(ids);
        setSelected(new Set());
        load();
    };

    const handleRemove = async () => {
        if (selected.size === 0) return;
        const ids = [...selected];
        await trafiqApi.removeIncidents(ids);
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
                                    <Ban size={14} aria-hidden="true" />
                                    Faux positif
                                </button>
                            )}
                            {/* Show unflag button if any selected item is a false positive */}
                            {[...selected].some(id => fpIncidents.find(a => a.id === id)) && (
                                <button className="adm-btn-primary" onClick={handleUnflag}>
                                    <Check size={14} aria-hidden="true" />
                                    Rétablir
                                </button>
                            )}
                            <button className="adm-btn-danger" onClick={handleRemove}>
                                <Trash2 size={14} aria-hidden="true" />
                                Supprimer
                            </button>
                            <button className="adm-btn-ghost" onClick={() => setSelected(new Set())}>
                                <X size={14} aria-hidden="true" />
                                Annuler
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
