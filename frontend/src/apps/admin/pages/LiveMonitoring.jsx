import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trafiqApi } from '../../../shared/services/trafiqApi';
import './LiveMonitoring.css';

// ─── Transform flat camera list into city-grouped structure ───────────────────
function groupCamerasByCityArea(cameras) {
    const groups = {};
    for (const cam of cameras) {
        const key = cam.city || cam.area || 'Unknown';
        if (!groups[key]) {
            groups[key] = {
                id: key.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                name: `${cam.area} Surveillance`,
                location: cam.city || cam.area,
                coords: { lat: cam.location.latitude, lng: cam.location.longitude },
                feeds: [],
            };
        }
        groups[key].feeds.push({
            id: cam.id,
            camId: cam.id,
            label: cam.label,
            src: cam.media_url || '',
            type: cam.media_type || 'video',
            placeholder: false,
        });
    }
    return Object.values(groups);
}

export default function LiveMonitoring() {
    const [cities, setCities] = useState([]);
    const [focusedCity, setFocusedCity] = useState(null);
    const [focusedFeed, setFocusedFeed] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        trafiqApi.getCameras()
            .then(cams => setCities(groupCamerasByCityArea(cams)))
            .catch(() => {});
    }, []);

    const totalFeeds = cities.reduce((n, c) => n + c.feeds.length, 0);

    const activeCities = focusedCity
        ? cities.filter(c => c.id === focusedCity)
        : cities;

    return (
        <div className="adm-live-page">
            {/* ── Header ── */}
            <div className="adm-live-header">
                <div>
                    <h2>Live Monitoring</h2>
                    <p className="adm-live-sub">
                        {cities.length} zones · {totalFeeds} flux · Détection IA multi-angle active
                    </p>
                </div>
                <div className="adm-live-controls">
                    <span className="adm-live-indicator" /> LIVE
                    {focusedCity && (
                        <button className="adm-btn-secondary" onClick={() => { setFocusedCity(null); setFocusedFeed(null); }}>
                            ← Toutes les zones
                        </button>
                    )}
                    {focusedFeed && (
                        <button className="adm-btn-secondary" onClick={() => setFocusedFeed(null)}>
                            ← Retour
                        </button>
                    )}
                </div>
            </div>

            {/* ── City tabs ── */}
            <div className="adm-live-tabs">
                <button
                    className={`adm-live-tab ${!focusedCity ? 'active' : ''}`}
                    onClick={() => setFocusedCity(null)}
                >
                    Toutes les zones
                </button>
                {cities.map(city => (
                    <button
                        key={city.id}
                        className={`adm-live-tab ${focusedCity === city.id ? 'active' : ''}`}
                        onClick={() => setFocusedCity(city.id)}
                    >
                        {city.location}
                    </button>
                ))}
            </div>

            {/* ── Feed grid ── */}
            <div className="adm-live-body">
                {activeCities.map(city => (
                    <div key={city.id} className="adm-live-city-block">
                        {/* City label */}
                        <div className="adm-live-city-label">
                            <span className="adm-live-city-name">{city.name}</span>
                            <span className="adm-live-city-loc">{city.location}</span>
                        </div>

                        {/* 3 feed panels */}
                        <div className={`adm-live-row ${focusedFeed ? 'focused-mode' : ''}`}>
                            {city.feeds.map(feed => (
                                <div
                                    key={feed.id}
                                    className={`adm-live-cell ${focusedFeed === feed.id ? 'adm-cell-focused' : ''} ${focusedFeed && focusedFeed !== feed.id ? 'adm-cell-hidden' : ''}`}
                                    onClick={() => setFocusedFeed(focusedFeed === feed.id ? null : feed.id)}
                                >
                                    <FeedPanel feed={feed} cityId={city.id} onLocate={(camId) => navigate(`/admin/dashboard?cam=${camId}`)} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Individual feed panel ────────────────────────────────────────────────────
function FeedPanel({ feed, cityId, onLocate }) {
    return (
        <div className="adm-feed-panel">
            <div className="adm-feed-bar">
                <span className="adm-feed-label">{feed.label}</span>
                {feed.placeholder ? (
                    <span className="adm-feed-placeholder-badge">📹 À filmer</span>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="adm-feed-live-badge">● LIVE</span>
                        <button
                            className="adm-btn-text"
                            onClick={(e) => {
                                e.stopPropagation();
                                onLocate(feed.camId);
                            }}
                            style={{ fontSize: '0.68rem', padding: 0 }}
                        >
                            🗺 Voir sur la carte
                        </button>
                    </div>
                )}
            </div>

            {feed.placeholder ? (
                // Placeholder for Ariana cameras not yet filmed
                <div className="adm-feed-placeholder">
                    <div className="adm-feed-placeholder-icon">📷</div>
                    <div className="adm-feed-placeholder-text">
                        Caméra {feed.label}
                    </div>
                    <div className="adm-feed-placeholder-sub">
                        Rond-point Café Bouslimi — flux à connecter
                    </div>
                </div>
            ) : feed.type === 'video' ? (
                <video
                    src={feed.src}
                    title={feed.label}
                    className="adm-feed-video"
                    autoPlay
                    muted
                    loop
                    controls
                    playsInline
                    preload="auto"
                />
            ) : (
                <iframe
                    src={feed.src}
                    title={feed.label}
                    className="adm-feed-iframe"
                    allow="autoplay; encrypted-media"
                    allowFullScreen
                    frameBorder="0"
                />
            )}
        </div>
    );
}