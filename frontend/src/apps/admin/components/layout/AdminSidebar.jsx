import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../shared/context/AuthContext';
import './AdminSidebar.css';

const navItems = [
    { path: '/admin/dashboard',   icon: '🏠', label: 'Vue d\'ensemble' },
    { path: '/admin/live',        icon: '📹', label: 'Live Monitoring' },
    { path: '/admin/incidents',   icon: '⚠️', label: 'Incidents', badge: true },
    { path: '/admin/congestion',  icon: '🚦', label: 'Congestion' },
    { path: '/admin/ai-agent',    icon: '🤖', label: 'Agent IA' },
    { path: '/admin/analytics',   icon: '📊', label: 'Analytics' },
    { path: '/admin/settings',    icon: '⚙️', label: 'Paramètres' },
];

export default function AdminSidebar() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [incidentCount, setIncidentCount] = useState(0);

    useEffect(() => {
        const fetchCount = () =>
            fetch('http://localhost:3000/accidents')
                .then(r => r.json())
                .then(data => setIncidentCount(Array.isArray(data) ? data.length : 0))
                .catch(() => {});
        fetchCount();
        const iv = setInterval(fetchCount, 10_000);
        return () => clearInterval(iv);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    return (
        <aside className="adm-sidebar">
            {/* Header */}
            <div className="adm-sb-header">
                <span className="adm-sb-logo">TRAFIQ</span>
                <span className="adm-sb-badge">ADMIN PANEL</span>
            </div>

            {/* Navigation */}
            <nav className="adm-sb-nav">
                {navItems.map(item => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `adm-sb-item ${isActive ? 'adm-sb-item-active' : ''}`}
                    >
                        <span className="adm-sb-item-icon">{item.icon}</span>
                        <span className="adm-sb-item-label">{item.label}</span>
                        {item.badge && incidentCount > 0 && (
                            <span className="adm-sb-item-badge">{incidentCount}</span>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* AI Status */}
            <div className="adm-sb-ai-status">
                <div className="adm-sb-ai-row">
                    <span className="adm-sb-ai-dot adm-dot-green" />
                    <span>best.pt ACTIVE</span>
                </div>
                <div className="adm-sb-ai-row">
                    <span className="adm-sb-ai-dot adm-dot-green" />
                    <span>Moteur v9.1 ON</span>
                </div>
                <div className="adm-sb-ai-scan">Dernier scan : il y a 2s</div>
            </div>

            <div className="adm-sb-divider" />

            {/* User Footer */}
            <div className="adm-sb-footer">
                <div className="adm-sb-avatar">{user?.avatar || 'AT'}</div>
                <div className="adm-sb-user-info">
                    <div className="adm-sb-user-name">{user?.name || 'Admin TRAFIQ'}</div>
                    <div className="adm-sb-user-email">{user?.email}</div>
                </div>
                <button className="adm-sb-logout" onClick={handleLogout} title="Déconnexion">↩</button>
            </div>
        </aside>
    );
}