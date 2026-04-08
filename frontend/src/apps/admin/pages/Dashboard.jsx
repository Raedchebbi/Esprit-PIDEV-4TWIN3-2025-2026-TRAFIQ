import React, { useEffect, useMemo, useState } from 'react';
import StatCard from '../components/StatCard';
import AdminMap from '../components/AdminMap';
import EventLogRow from '../components/EventLogRow';
import IncidentCard from '../components/IncidentCard';
import './Dashboard.css';

export default function Dashboard() {
    const [incidents, setIncidents] = useState([]);

    useEffect(() => {
        const load = () => {
            fetch('http://localhost:3000/accidents')
                .then(res => res.json())
                .then(setIncidents)
                .catch(() => {});
        };
        load();
        const iv = setInterval(load, 10000);
        return () => clearInterval(iv);
    }, []);

    const stats = useMemo(() => {
        const vehicleIds = new Set();
        incidents.forEach((inc) => {
            if (inc.vehicle_a !== undefined && inc.vehicle_a !== null && inc.vehicle_a !== -1) vehicleIds.add(inc.vehicle_a);
            if (inc.vehicle_b !== undefined && inc.vehicle_b !== null && inc.vehicle_b !== -1) vehicleIds.add(inc.vehicle_b);
        });

        const avgConf = incidents.length
            ? Math.round(incidents.reduce((s, i) => s + (i.confidence || 0), 0) / incidents.length * 100)
            : 0;

        const blockedSources = new Set(
            incidents
                .filter((i) => ['HIGH', 'CRITICAL'].includes(String(i.risk_level || '').toUpperCase()))
                .map((i) => i.camera_id)
                .filter(Boolean)
        ).size;

        return {
            vehicles: vehicleIds.size,
            activeAccidents: incidents.length,
            blockedSources,
            corrections: 0,
            confidence: avgConf,
        };
    }, [incidents]);

    const events = incidents.slice(0, 10).map((inc) => ({
        id: inc.incident_id,
        time: inc.timestamp?.split(' ')[1] || '--:--:--',
        type: 'CONFIRM',
        level: inc.risk_level || 'LOW',
        pair: `#${inc.vehicle_a}↔#${inc.vehicle_b}`,
        score: Math.round((Number(inc.risk_score) || 0) * 100),
        conf: inc.confidence || 0,
    }));

    const incidentCards = incidents.slice(0, 10).map((inc) => ({
        id: inc.incident_id,
        type: 'Collision',
        severity: ['HIGH', 'CRITICAL'].includes(String(inc.risk_level || '').toUpperCase()) ? 'high' : 'medium',
        vehicles: `#${inc.vehicle_a} → #${inc.vehicle_b}`,
        conf: inc.confidence || 0,
        level: inc.risk_level || 'LOW',
        timestamp: inc.timestamp,
        snapshot: inc.snapshot,
        camera_id: inc.camera_id,
        active: true,
    }));

    return (
        <div className="adm-dashboard">
            {/* Row 1: Stat Cards */}
            <div className="adm-dash-stats">
                <StatCard
                    title="Véhicules détectés"
                    value={stats.vehicles}
                />
                <StatCard
                    title="Accidents actifs"
                    value={stats.activeAccidents}
                    urgent={stats.activeAccidents > 0}
                />
                <StatCard
                    title="Sources à risque élevé"
                    value={stats.blockedSources}
                    urgent={stats.blockedSources > 0}
                />
                <StatCard
                    title="Auto-corrections"
                    value={stats.corrections}
                />
                <StatCard
                    title="Confiance IA"
                    value={`${stats.confidence}%`}
                    gauge={stats.confidence}
                />
            </div>

            {/* Row 2: Map & Live Feed */}
            <div className="adm-dash-grid">
                <div className="adm-dash-map-wrap">
                    <div className="adm-card-header">
                        <h3>Surveillance Géographique Live</h3>
                        <div className="adm-card-actions">
                            <span className="adm-live-dot" /> LIVE
                        </div>
                    </div>
                    <div className="adm-dash-map-content">
                        <AdminMap />
                    </div>
                </div>

                <div className="adm-dash-feed">
                    <div className="adm-card-header">
                        <h3>Flux événements temps réel</h3>
                        <span className="adm-badge-blue">{events.length} logs</span>
                    </div>
                    <div className="adm-dash-feed-content">
                        {events.map((event, idx) => (
                            <EventLogRow key={event.id || idx} event={event} />
                        ))}
                    </div>
                </div>
            </div>

            {/* Row 3: Recent Incidents */}
            <div className="adm-dash-incidents">
                <div className="adm-card-header">
                    <h3>Incidents récents à traiter</h3>
                    <button className="adm-btn-text">Voir tous les incidents →</button>
                </div>
                <div className="adm-dash-incidents-grid">
                    {incidentCards.map(acc => (
                        <IncidentCard key={acc.id} incident={acc} compact />
                    ))}
                </div>
            </div>
        </div>
    );
}
