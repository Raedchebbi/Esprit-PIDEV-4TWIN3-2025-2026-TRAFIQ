import React from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { MapIcon, NavigationIcon, RouteIcon, BellIcon } from 'lucide-react';
import { useTrafik } from '../../shared/context/TrafikContext';
import { useProximity } from '../../shared/hooks/useProximity';
import { useRouteSessionContext } from '../../shared/context/RouteSessionContext';
import ProximityAlert from './components/ProximityAlert';
import NavigationNotifications from './components/NavigationNotifications';
import NavigationOverlay from './components/NavigationOverlay';
import './PublicApp.css';

export default function PublicApp() {
  const location = useLocation();
  const { accidentsGPS } = useTrafik();
  const { position, alertCount } = useRouteSessionContext();
  const { nearby, hasNearby } = useProximity(position, accidentsGPS, 30);

  const navItems = [
    { path: '/', icon: MapIcon, label: 'Carte' },
    { path: '/plan', icon: NavigationIcon, label: 'Itinéraire' },
    { path: '/routes', icon: RouteIcon, label: 'Routes' },
  ];

  const totalAlerts = alertCount + (hasNearby ? nearby.length : 0);

  return (
    <div className="pub-app">
      <header className="pub-topbar">
        <Link to="/" className="pub-logo">
          <span className="pub-logo-text">TRAFIQ</span>
          <span className="pub-logo-tag">Trafic en temps réel</span>
        </Link>

        <div className="pub-topbar-search">
          <Link to="/plan" className="pub-search-btn">
            <span className="pub-search-icon">📍</span>
            <span className="pub-search-placeholder">De... → Vers...</span>
            <span className="pub-search-icon">📍</span>
          </Link>
        </div>

        <div className="pub-topbar-right">
          <button className="pub-icon-btn" title="Notifications" type="button">
            <BellIcon size={20} />
            {totalAlerts > 0 && (
              <span className="pub-notif-badge">{totalAlerts}</span>
            )}
          </button>
          <button className="pub-icon-btn" title="Ma position" type="button">
            <NavigationIcon size={20} />
          </button>
          <Link to="/admin/login" className="pub-admin-link">
            Admin ↗
          </Link>
        </div>
      </header>

      {hasNearby && <ProximityAlert accidents={nearby} />}

      <main className="pub-main">
        <Outlet />
      </main>

      <NavigationNotifications />
      <NavigationOverlay />

      <nav className="pub-bottom-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`pub-nav-item ${location.pathname === item.path ? 'pub-nav-active' : ''}`}
          >
            <item.icon size={22} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
