import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LiveMonitoring.css';

// ─── Feed Configuration ───────────────────────────────────────────────────────
const CITIES = [
    {
        id: 'france',
        name: 'France Surveillance',
        location: 'France 🇫🇷',
        coords: { lat: 47.79524, lng: 2.19883 },
        feeds: [
            {
                id: 'fr-1',
                camId: 'cam0',
                label: '47.79524, 2.19883',
                src: '/videos/accident.mp4',
                type: 'video',
                placeholder: false,
            },
        ],
    },
    {
        id: 'spain',
        name: 'Spain Surveillance',
        location: 'Spain 🇪🇸',
        coords: { lat: 42.583428, lng: -5.818252 },
        feeds: [
            {
                id: 'es-1',
                camId: 'cam1',
                label: '42.583428, -5.818252',
                src: '/videos/accident0.mp4',
                type: 'video',
                placeholder: false,
            },
        ],
    },
    {
        id: 'astrakhan',
        name: 'Astrakhan Surveillance',
        location: 'Astrakhan, Russia 🇷🇺',
        coords: { lat: 46.3370, lng: 48.0240 },
        feeds: [
            {
                id: 'ast-1',
                camId: 'cam2',
                label: 'Боевая, 45',
                src: 'https://webcams.windy.com/webcams/public/embed/player/1625695244/live',
                type: 'iframe',
                placeholder: false,
            },
            {
                id: 'ast-2',
                camId: 'cam3',
                label: 'Боевая, 36',
                src: 'https://webcams.windy.com/webcams/public/embed/player/1625695351/live',
                type: 'iframe',
                placeholder: false,
            },
            {
                id: 'ast-3',
                camId: 'cam4',
                label: 'Б. Хмельницкого, 17',
                src: 'https://webcams.windy.com/webcams/public/embed/player/1625695315/live',
                type: 'iframe',
                placeholder: false,
            },
        ],
    },
];

export default function LiveMonitoring() {
    // focusedCity: 'ariana' | 'nyc' | null (null = show all 6)
    const [focusedCity, setFocusedCity] = useState(null);
    const [focusedFeed, setFocusedFeed] = useState(null); // feed id for single zoom
    const navigate = useNavigate();

    const activeCities = focusedCity
        ? CITIES.filter(c => c.id === focusedCity)
        : CITIES;

    return (
        <div className="adm-live-page">
            {/* ── Header ── */}
            <div className="adm-live-header">
                <div>
                    <h2>Live Monitoring</h2>
                    <p className="adm-live-sub">
                        3 zones · 5 flux · Détection IA multi-angle active
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
                {CITIES.map(city => (
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