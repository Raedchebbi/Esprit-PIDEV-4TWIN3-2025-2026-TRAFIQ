import React from 'react';
import './AdminTopBar.css';

export default function AdminTopBar() {
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
            </div>
        </header>
    );
}