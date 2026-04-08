import React, { useEffect, useMemo, useState } from 'react';
import './AIAgent.css';

export default function AIAgent() {
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

    const metrics = useMemo(() => {
        const avgConf = incidents.length
            ? Math.round(incidents.reduce((s, i) => s + (i.confidence || 0), 0) / incidents.length * 100)
            : 0;
        const avgRisk = incidents.length
            ? Math.round(incidents.reduce((s, i) => s + (Number(i.risk_score) || 0), 0) / incidents.length * 100)
            : 0;

        const levelDist = incidents.reduce((acc, inc) => {
            const lvl = String(inc.risk_level || 'LOW').toUpperCase();
            acc[lvl] = (acc[lvl] || 0) + 1;
            return acc;
        }, {});

        const total = incidents.length || 1;
        const levelPercent = Object.fromEntries(
            Object.entries(levelDist).map(([k, v]) => [k, Math.round((v / total) * 100)])
        );

        return { avgConf, avgRisk, levelPercent };
    }, [incidents]);

    const events = incidents.slice(0, 15).map((inc) => ({
        time: inc.timestamp?.split(' ')[1] || '--:--:--',
        type: 'CONFIRM',
        level: inc.risk_level || 'LOW',
        pair: `#${inc.vehicle_a}↔#${inc.vehicle_b}`,
        score: Math.round((Number(inc.risk_score) || 0) * 100),
        conf: inc.confidence || 0,
    }));

    const pipeline = [
        { key: 'INGEST', ok: true, value: `${incidents.length} incidents reçus`, running: false },
        { key: 'DETECTION', ok: true, value: 'YOLO + tracking actifs', running: true },
        { key: 'RISK', ok: true, value: `Score moyen: ${metrics.avgRisk}/100`, running: false },
        { key: 'CONFIDENCE', ok: true, value: `Confiance moyenne: ${metrics.avgConf}%`, running: false },
    ];

    return (
        <div className="adm-ai-agent-page">
            <div className="adm-ai-header">
                <h2>Agent IA — Monitoring Décisionnel</h2>
                <p>Surveillance du moteur d'analyse en temps réel (best.pt v9.1)</p>
            </div>

            <div className="adm-ai-grid">
                {/* Column 1: Pipeline */}
                <div className="adm-ai-card pipeline">
                    <div className="adm-ai-card-title">🤖 Pipeline de décision</div>
                    <div className="adm-pipeline-steps">
                        {pipeline.map((data) => (
                            <div key={data.key} className={`adm-step-item ${data.running ? 'running' : ''}`}>
                                <div className="adm-step-icon">{data.ok ? '✅' : '🔄'}</div>
                                <div className="adm-step-info">
                                    <div className="adm-step-name">{data.key}</div>
                                    <div className="adm-step-val">{data.value}</div>
                                </div>
                                {data.running && <div className="adm-step-spinner" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 2: Log */}
                <div className="adm-ai-card logs">
                    <div className="adm-ai-card-title">📋 Journal de décisions</div>
                    <div className="adm-ai-logs-list">
                        {events.slice(0, 15).map((ev, i) => (
                            <div key={i} className={`adm-ai-log-entry ${ev.type.toLowerCase()}`}>
                                <div className="adm-log-time">{ev.time}</div>
                                <div className="adm-log-main">
                                    <span className="adm-log-tag">[{ev.type} {ev.level || ''}]</span>
                                    <span className="adm-log-pair">{ev.pair}</span>
                                </div>
                                <div className="adm-log-meta">
                                    score={ev.score} {ev.conf && `conf=${ev.conf}`} {ev.reason && `rev=${ev.reason}`}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Column 3: Stats */}
                <div className="adm-ai-card stats">
                    <div className="adm-ai-card-title">📊 Performance du moteur</div>
                    <div className="adm-ai-metrics">
                        <div className="adm-metric-row">
                            <span>Sources actives :</span>
                            <strong>5</strong>
                        </div>
                        <div className="adm-metric-row">
                            <span>Confiance moyenne :</span>
                            <strong>{metrics.avgConf}%</strong>
                        </div>
                        <div className="adm-metric-row">
                            <span>Accidents confirmés :</span>
                            <strong>{incidents.length}</strong>
                        </div>
                        <div className="adm-metric-row">
                            <span>Risque moyen :</span>
                            <strong>{metrics.avgRisk}/100</strong>
                        </div>
                        <div className="adm-metric-row">
                            <span>Snapshots disponibles :</span>
                            <strong>{incidents.filter(i => i.snapshot).length}</strong>
                        </div>

                        <div className="adm-ai-dist">
                            <div className="adm-dist-title">Répartition niveaux :</div>
                            {Object.entries(metrics.levelPercent).map(([lvl, val]) => (
                                <div key={lvl} className="adm-dist-row">
                                    <span className="adm-dist-lvl">{lvl}</span>
                                    <div className="adm-dist-bar-bg">
                                        <div className="adm-dist-bar" style={{ width: `${val}%` }} />
                                    </div>
                                    <span className="adm-dist-val">{val}%</span>
                                </div>
                            ))}
                        </div>

                        <div className="adm-ai-conf">
                            <div className="adm-dist-title">Confiance IA moyenne :</div>
                            <div className="adm-conf-big-bar">
                                <div className="adm-conf-progress" style={{ width: `${metrics.avgConf}%` }} />
                                <span className="adm-conf-text">{metrics.avgConf}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
