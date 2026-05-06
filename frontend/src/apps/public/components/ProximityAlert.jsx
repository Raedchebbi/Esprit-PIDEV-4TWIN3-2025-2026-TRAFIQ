import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, TriangleAlert, X } from 'lucide-react';
import { useNotifications } from '../../../shared/hooks/useNotifications';
import './ProximityAlert.css';

export default function ProximityAlert({ accidents }) {
    const [dismissed, setDismissed] = useState([]);
    const [bannerDismissed, setBannerDismissed] = useState(false);
    const { permission, requestPermission, sendNotification } = useNotifications();

    const visible = accidents.filter(a => !dismissed.includes(a.id));
    const showNotificationBanner = permission === 'default' && !bannerDismissed;

    useEffect(() => {
        visible.forEach(a => {
            sendNotification(
                a.id,
                'TRAFIQ — Accident proche',
                `Un accident a été détecté à ${a.distance}m sur votre route. Des itinéraires alternatifs sont disponibles.`
            );
        });
    }, [visible, sendNotification]);

    if (visible.length === 0 && !showNotificationBanner) return null;

    return (
        <>
            {/* Notification permission banner */}
            {showNotificationBanner && (
                <div className="notif-permission-banner">
                    <span><Bell size={16} aria-hidden="true" /> Activez les notifications pour recevoir des alertes d'accidents en temps réel.</span>
                    <div className="notif-banner-actions">
                        <button onClick={() => { requestPermission(); setBannerDismissed(true); }}>
                            Activer les notifications
                        </button>
                        <button className="later-btn" onClick={() => setBannerDismissed(true)}>Plus tard</button>
                    </div>
                </div>
            )}

            {/* Toast alerts for each nearby accident */}
            <div className="proximity-alerts-stack">
                {visible.slice(0, 2).map(accident => (
                    <div key={accident.id} className="proximity-toast">
                        <div className="proximity-toast-icon"><TriangleAlert size={20} aria-hidden="true" /></div>
                        <div className="proximity-toast-body">
                            <div className="proximity-toast-title">ACCIDENT DÉTECTÉ SUR VOTRE ROUTE</div>
                            <div className="proximity-toast-sub">
                                À environ <strong>{accident.distance} mètres</strong> devant vous
                            </div>
                            <Link to="/plan" className="proximity-toast-action">
                                Voir itinéraires alternatifs →
                            </Link>
                        </div>
                        <button className="proximity-toast-close" onClick={() => setDismissed(d => [...d, accident.id])}>
                            <X size={14} aria-hidden="true" />
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
}
