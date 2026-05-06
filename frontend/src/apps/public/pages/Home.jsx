import React, { useState } from 'react';
import { Circle, MapPinned } from 'lucide-react';
import PublicMap from '../components/PublicMap';
import { useTrafik } from '../../../shared/context/TrafikContext';
import { useRouteSessionContext } from '../../../shared/context/RouteSessionContext';
import { Link } from 'react-router-dom';
import './Home.css';

const statusStyle = {
    free: { label: 'Fluide', color: '#2E7D32' },
    slow: { label: 'Dense', color: '#F57C00' },
    blocked: { label: 'BLOQUÉE', color: '#B71C1C' },
};

export default function Home() {
  const { routesData } = useTrafik();
  const { activeRoute, isNavigating, position } = useRouteSessionContext();
  const [panelOpen, setPanelOpen] = useState(true);

  const panelRoutes = routesData.slice(0, 4);

  return (
    <div className="home-page">
      <div className="home-map-wrap">
        <PublicMap
          activeRoute={isNavigating ? activeRoute : null}
          position={position}
          showProximityCircle
        />
      </div>

      <div className={`home-panel ${panelOpen ? 'home-panel-open' : ''}`}>
        <button
          className="home-panel-handle"
          onClick={() => setPanelOpen((open) => !open)}
          type="button"
        >
          <div className="home-panel-bar" />
        </button>

        {panelOpen && (
          <>
            <div className="home-panel-title">État du trafic maintenant</div>
            <div className="home-panel-routes">
              {panelRoutes.map((route) => {
                const s = statusStyle[route.status] || statusStyle.slow;
                return (
                  <div key={route.id} className="home-route-row">
                    <Circle
                      className="home-route-icon"
                      size={14}
                      fill={s.color}
                      color={s.color}
                      strokeWidth={0}
                      aria-hidden="true"
                    />
                    <span className="home-route-name">{route.name}</span>
                    <span
                      className="home-route-status"
                      style={{ color: s.color }}
                    >
                      {s.label}
                    </span>
                    {route.extra != null && route.extra > 0 && (
                      <span className="home-route-time">{route.extra} min</span>
                    )}
                    {route.status === 'blocked' && (
                      <span
                        className="home-route-time"
                        style={{ color: '#B71C1C' }}
                      >
                        ∞
                      </span>
                    )}
                  </div>
                );
              })}
              {panelRoutes.length === 0 && (
                <div className="home-route-empty">Aucune donnée trafic disponible.</div>
              )}
            </div>
            <Link to="/plan" className="home-plan-btn">
              <MapPinned size={16} aria-hidden="true" />
              Planifier mon itinéraire →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
