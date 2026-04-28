import React from 'react';
import { useAuth } from '../../../../shared/context/AuthContext';
import './AdminTopBar.css';

export default function AdminTopBar() {
    const { user, isSuperAdmin } = useAuth();

    return (
        <header className="adm-topbar">
            <div className="adm-tb-left">
                <div className="adm-tb-title">TRAFIQ Admin Panel</div>
            </div>
            <div className="adm-tb-center">
                <div className="adm-tb-status">
                    <span className="adm-status-dot green"></span>
                    System Online
                </div>
                {user?.country && (
                    <div className="adm-tb-scope">
                        <span className="adm-tb-scope-flag">🏳</span>
                        <span>{user.country}</span>
                    </div>
                )}
                {isSuperAdmin && (
                    <div className="adm-tb-scope adm-tb-scope-global">
                        <span className="adm-tb-scope-flag">🌍</span>
                        <span>Global Access</span>
                    </div>
                )}
            </div>
            <div className="adm-tb-right">
                <span className={`adm-tb-role-badge ${isSuperAdmin ? 'super' : 'admin'}`}>
                    {isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN'}
                </span>
            </div>
        </header>
    );
}