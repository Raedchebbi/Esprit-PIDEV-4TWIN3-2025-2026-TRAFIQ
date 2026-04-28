import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../shared/context/AuthContext';
import { trafiqApi } from '../../../../shared/services/trafiqApi';
import './AdminSidebar.css';

export default function AdminSidebar() {
    const { user, logout, isSuperAdmin } = useAuth();
    const navigate = useNavigate();
    const [incidentCount, setIncidentCount] = useState(0);

    useEffect(() => {
        const fetchCount = () =>
            trafiqApi.getActiveAccidents()
                .then(data => setIncidentCount(Array.isArray(data) ? data.length : 0))
                .catch(console.error);
        fetchCount();
        const iv = setInterval(fetchCount, 5_000);
        return () => clearInterval(iv);
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Build nav items based on role
    const navItems = [
        { path: '/admin/dashboard',   icon: '🏠', label: 'Vue d\'ensemble' },
        { path: '/admin/live',        icon: '📹', label: 'Live Monitoring' },
        { path: '/admin/incidents',   icon: '⚠️', label: 'Incidents', badge: true },
        { path: '/admin/congestion',  icon: '🚦', label: 'Congestion' },
        { path: '/admin/ai-agent',    icon: '🤖', label: 'Agent IA' },
        { path: '/admin/analytics',   icon: '📊', label: 'Analytics' },
        { path: '/admin/settings',    icon: '⚙️', label: 'Paramètres' },
    ];

    // SUPER_ADMIN gets the admin management page
    if (isSuperAdmin) {
        navItems.push({
            path: '/admin/admin-management',
            icon: '👥',
            label: 'Gestion Admins',
            superOnly: true,
        });
    }

    const roleBadge = isSuperAdmin ? 'SUPER ADMIN' : 'ADMIN';
    const roleColor = isSuperAdmin ? '#8B5CF6' : '#00ACC1';

    return (
        <aside className="adm-sidebar">
            {/* Header */}
            <div className="adm-sb-header">
                <span className="adm-sb-logo">TRAFIQ</span>
                <span className="adm-sb-badge" style={{ background: roleColor }}>
                    {roleBadge}
                </span>
            </div>

            {/* Country Scope Indicator */}
            {user?.country && (
                <div className="adm-sb-scope">
                    <span className="adm-sb-scope-icon">🏳</span>
                    <span className="adm-sb-scope-text">{user.country}</span>
                </div>
            )}
            {isSuperAdmin && (
                <div className="adm-sb-scope adm-sb-scope-global">
                    <span className="adm-sb-scope-icon">🌍</span>
                    <span className="adm-sb-scope-text">Accès Global</span>
                </div>
            )}

            {/* Navigation */}
            <nav className="adm-sb-nav">
                {navItems.map(item => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => `adm-sb-item ${isActive ? 'adm-sb-item-active' : ''} ${item.superOnly ? 'adm-sb-item-super' : ''}`}
                    >
                        <span className="adm-sb-item-icon">{item.icon}</span>
                        <span className="adm-sb-item-label">{item.label}</span>
                        {item.badge && incidentCount > 0 && (
                            <span className="adm-sb-item-badge">{incidentCount}</span>
                        )}
                        {item.superOnly && (
                            <span className="adm-sb-super-tag">SA</span>
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
                <div className="adm-sb-avatar" style={{ background: roleColor }}>
                    {user?.avatar || user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2) || 'AT'}
                </div>
                <div className="adm-sb-user-info">
                    <div className="adm-sb-user-name">{user?.name || 'Admin TRAFIQ'}</div>
                    <div className="adm-sb-user-email">{user?.email}</div>
                    {user?.country && (
                        <div className="adm-sb-user-country">📍 {user.country}</div>
                    )}
                </div>
                <button className="adm-sb-logout" onClick={handleLogout} title="Déconnexion">↩</button>
            </div>
        </aside>
    );
}