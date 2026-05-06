import React from 'react';
import { AlertTriangle, Circle, CircleCheck, Clock3, Info, Play, Ruler } from 'lucide-react';
import './RouteCard.css';

const statusConfig = {
    free: { label: 'Trafic fluide', color: '#2E7D32', bg: '#E8F5E9' },
    slow: { label: 'Trafic modéré', color: '#F57C00', bg: '#FFF3E0' },
    blocked: { label: 'ACCIDENT EN COURS', color: '#B71C1C', bg: '#FFEBEE', urgent: true },
};

export default function RouteCard({ route, onStart, selected }) {
    const { label, labelColor, labelBg, roads, time, dist, status, incidents, isAccident } = route;
    const sc = statusConfig[status] || statusConfig.slow;

    return (
        <div className={`route-card ${selected ? 'route-card-selected' : ''} ${isAccident ? 'route-card-accident' : ''}`}>
            <div className="route-card-header">
                <span className="route-card-label" style={{ color: labelColor, background: labelBg }}>
                    {label}
                </span>
            </div>

            <div className="route-card-roads">
                {roads.join(' — ')}
            </div>

            <div className="route-card-stats">
                <span><Clock3 size={14} aria-hidden="true" /> {time} min</span>
                <span><Ruler size={14} aria-hidden="true" /> {dist} km</span>
                <span style={{ color: sc.color }}>
                    <Circle size={14} fill={sc.color} color={sc.color} strokeWidth={0} aria-hidden="true" />
                    {sc.label}
                </span>
            </div>

            {incidents > 0 ? (
                <div className={`route-card-incident ${sc.urgent ? 'urgent' : ''}`}>
                    {sc.urgent
                        ? <><AlertTriangle size={14} aria-hidden="true" /> Accident confirmé par TRAFIQ AI — Voie partiellement bloquée. Temps d'attente estimé : 15-20 min</>
                        : <><Info size={14} aria-hidden="true" /> {incidents} incident(s) signalé(s) sur ce trajet</>}
                </div>
            ) : (
                <div className="route-card-clear"><CircleCheck size={14} aria-hidden="true" /> Aucun incident signalé sur ce trajet</div>
            )}

            <button className="route-card-btn" onClick={() => onStart && onStart(route)}>
                {isAccident ? <AlertTriangle size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                {isAccident ? 'Quand même utiliser' : 'Démarrer ce trajet'}
            </button>
        </div>
    );
}
