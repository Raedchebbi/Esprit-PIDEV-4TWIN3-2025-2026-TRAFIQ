import React from 'react';
import { ArrowDown, ArrowUp, Circle, TriangleAlert } from 'lucide-react';
import { useTrafik } from '../../../shared/context/TrafikContext';
import { Link } from 'react-router-dom';
import './RouteStatus.css';

const statusMeta = {
    free: { label: 'Fluide', ArrowIcon: ArrowDown, color: '#2E7D32' },
    slow: { label: 'Dense', ArrowIcon: ArrowUp, color: '#F57C00' },
    blocked: { label: 'BLOQUÉ', ArrowIcon: TriangleAlert, color: '#B71C1C' },
};

export default function RouteStatus() {
    const { routesData, stats } = useTrafik();

    const categories = [...new Set(routesData.map(r => r.category))];
    const blocked = routesData.filter(r => r.status === 'blocked').length;
    const slow = routesData.filter(r => r.status === 'slow').length;

    const globalLabel = blocked > 0 ? 'PERTURBÉ' : slow > 0 ? 'MODÉRÉ' : 'FLUIDE';
    const globalColor = blocked > 0 ? '#B71C1C' : slow > 0 ? '#F57C00' : '#2E7D32';
    const globalColorIcon = blocked > 0 ? '#B71C1C' : slow > 0 ? '#F57C00' : '#2E7D32';

    return (
        <div className="routes-page">
            <div className="routes-header">
                <h1>État des routes surveillées</h1>
                <div className="routes-update">
                    Source : TRAFIQ backend + congestion temps réel
                </div>
            </div>

            {/* Global indicator */}
            <div className="routes-global" style={{ borderLeftColor: globalColor }}>
                <Circle
                    className="routes-global-icon"
                    size={18}
                    fill={globalColorIcon}
                    color={globalColorIcon}
                    strokeWidth={0}
                    aria-hidden="true"
                />
                    <div>
                        <div className="routes-global-label" style={{ color: globalColor }}>
                            Trafic {globalLabel} sur les zones surveillées
                        </div>
                        <div className="routes-global-sub">
                            {stats.accidents} accidents actifs · {blocked} route{blocked !== 1 ? 's' : ''} bloquée{blocked !== 1 ? 's' : ''} · {slow} route{slow !== 1 ? 's' : ''} dense{slow !== 1 ? 's' : ''}
                        </div>
                    </div>
            </div>

            {/* Route categories */}
            <div className="routes-content">
                {routesData.length === 0 && (
                    <div className="routes-empty">Aucune donnée de congestion disponible.</div>
                )}
                {categories.map(cat => (
                    <div key={cat} className="routes-section">
                        <div className="routes-section-title">{cat}</div>
                        {routesData.filter(r => r.category === cat).map(route => {
                            const s = statusMeta[route.status] || statusMeta.slow;
                            const ArrowIcon = s.ArrowIcon;
                            return (
                                <div key={route.id} className="routes-row">
                                    <Circle
                                        className="routes-row-icon"
                                        size={14}
                                        fill={s.color}
                                        color={s.color}
                                        strokeWidth={0}
                                        aria-hidden="true"
                                    />
                                    <span className="routes-row-name">{route.name}</span>
                                    <span className="routes-row-status" style={{ color: s.color }}>{s.label}</span>
                                    <span className="routes-row-meta" style={{ color: s.color }}>
                                        <ArrowIcon size={12} aria-hidden="true" />
                                        {route.extra ? ` +${route.extra} min` : ''}
                                        {route.incident ? ' Accident' : ''}
                                        {route.reason ? ` Travaux` : ''}
                                    </span>
                                    {route.status === 'blocked' && (
                                        <Link to="/plan" className="routes-alt-btn">
                                            Itinéraires alternatifs →
                                        </Link>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
