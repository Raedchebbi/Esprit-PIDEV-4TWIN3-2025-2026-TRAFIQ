import React from 'react';
import { Earth, Flag } from 'lucide-react';
import { useAuth } from '../../../shared/context/AuthContext';
import './Settings.css';

export default function Settings() {
    const { user, isSuperAdmin } = useAuth();

    return (
        <div className="adm-settings-page">
            <div className="adm-settings-header">
                <h2>Paramètres Système</h2>
            </div>

            <div className="adm-settings-content">
                <aside className="adm-settings-sidebar">
                    <button className="adm-set-nav active">Compte</button>
                    <button className="adm-set-nav">Système</button>
                    <button className="adm-set-nav">Caméras</button>
                    <button className="adm-set-nav">Zones & Routes</button>
                    <button className="adm-set-nav">Notifications</button>
                </aside>

                <div className="adm-settings-panel">
                    {/* Account Info Section */}
                    <section className="adm-set-section">
                        <h3>Informations du Compte</h3>
                        <div className="adm-set-account-grid">
                            <div className="adm-set-account-row">
                                <span className="adm-set-account-label">Nom</span>
                                <span className="adm-set-account-value">{user?.name || '—'}</span>
                            </div>
                            <div className="adm-set-account-row">
                                <span className="adm-set-account-label">Email</span>
                                <span className="adm-set-account-value">{user?.email || '—'}</span>
                            </div>
                            <div className="adm-set-account-row">
                                <span className="adm-set-account-label">Rôle</span>
                                <span className={`adm-set-role-badge ${isSuperAdmin ? 'super' : 'admin'}`}>
                                    {user?.role || '—'}
                                </span>
                            </div>
                            <div className="adm-set-account-row">
                                <span className="adm-set-account-label">Portée</span>
                                <span className="adm-set-account-value">
                                    {isSuperAdmin ? (
                                        <><Earth size={14} aria-hidden="true" /> Accès global (tous les pays)</>
                                    ) : (
                                        <><Flag size={14} aria-hidden="true" /> {user?.country || '—'}</>
                                    )}
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* Alert Radius */}
                    <section className="adm-set-section">
                        <h3>Configuration du rayon d'alerte</h3>
                        <p>Définit dans quel périmètre les conducteurs reçoivent une notification d'accident.</p>
                        <div className="adm-set-row">
                            <label>Rayon actuel :</label>
                            <div className="adm-input-group">
                                <input type="number" defaultValue={30} className="adm-input-small" />
                                <span>mètres</span>
                            </div>
                            <button className="adm-btn-primary">Modifier</button>
                        </div>
                    </section>

                    {/* Auto Notifications */}
                    <section className="adm-set-section">
                        <h3>Notifications automatiques</h3>
                        <div className="adm-set-row jc-sb">
                            <div>
                                <div className="fw-700">Notifications actives</div>
                                <div className="fs-08 c-gray">Envoyer automatiquement aux conducteurs proches.</div>
                            </div>
                            <div className="adm-toggle active" />
                        </div>
                    </section>

                    {/* Alert Log */}
                    <section className="adm-set-section">
                        <h3>Journal des alertes envoyées</h3>
                        <div className="adm-set-log">
                            <div className="adm-log-line">14:32:10 — 3 conducteurs alertés (rayon 30m, accident #3↔#7)</div>
                            <div className="adm-log-line">14:28:45 — 1 conducteur alerté (rayon 30m, accident #9)</div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
