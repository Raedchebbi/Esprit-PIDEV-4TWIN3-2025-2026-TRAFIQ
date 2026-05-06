import React, { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Map, MapPin, Navigation, Route } from 'lucide-react';
import { useTrafik } from '../../shared/context/TrafikContext';
import { useProximity } from '../../shared/hooks/useProximity';
import { useRouteSessionContext } from '../../shared/context/RouteSessionContext';
import ProximityAlert from './components/ProximityAlert';
import NavigationNotifications from './components/NavigationNotifications';
import NavigationOverlay from './components/NavigationOverlay';
import './PublicApp.css';

export default function PublicApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const { accidentsGPS } = useTrafik();
  const { position, alertCount } = useRouteSessionContext();
  const { nearby, hasNearby } = useProximity(position, accidentsGPS, 30);

  const navItems = [
    { path: '/', icon: Map, label: 'Carte' },
    { path: '/plan', icon: Navigation, label: 'Itinéraire' },
    { path: '/routes', icon: Route, label: 'Routes' },
  ];

  const totalAlerts = alertCount + (hasNearby ? nearby.length : 0);

  const handleCenterPosition = () => {
    if (!position) return;

    const centerEvent = new CustomEvent('trafiq-center-position', {
      detail: { lat: position.lat, lng: position.lng },
    });

    if (location.pathname !== '/') {
      navigate('/', { replace: false });
      window.setTimeout(() => window.dispatchEvent(centerEvent), 150);
      return;
    }

    window.dispatchEvent(centerEvent);
  };

  return (
    <div className="pub-app">
      <header className="pub-topbar">
        <Link to="/" className="pub-logo">
          <span className="pub-logo-text">TRAFIQ</span>
          <span className="pub-logo-tag">Trafic en temps réel</span>
        </Link>

        <div className="pub-topbar-search">
          <Link to="/plan" className="pub-search-btn">
            <MapPin className="pub-search-icon" size={14} aria-hidden="true" />
            <span className="pub-search-placeholder">De... → Vers...</span>
            <MapPin className="pub-search-icon" size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="pub-topbar-right">
          <button className="pub-icon-btn" title="Notifications" type="button">
            <Bell size={20} />
            {totalAlerts > 0 && (
              <span className="pub-notif-badge">{totalAlerts}</span>
            )}
          </button>
          <button
            className="pub-icon-btn"
            title="Ma position"
            type="button"
            onClick={handleCenterPosition}
            disabled={!position}
          >
            <Navigation size={20} />
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
