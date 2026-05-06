// ── TRAFIQ — Navigation Notifications ────────────────────────────────────────
// Real-time scoped notification component for active navigation sessions.
// Renders floating toast stack for urgent alerts and subtle banners for info.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlertTriangle,
  CircleAlert,
  Clock3,
  Info,
  MapPin,
  Siren,
  X,
} from 'lucide-react';
import { useRouteSessionContext } from '../../../shared/context/RouteSessionContext';
import { useNotifications } from '../../../shared/hooks/useNotifications';
import './NavigationNotifications.css';

const SEVERITY_CONFIG = {
  critical: {
    Icon: Siren,
    label: 'CRITIQUE',
    color: '#B71C1C',
    bg: '#FFEBEE',
    border: '#EF9A9A',
    autoDismiss: false,
  },
  high: {
    Icon: AlertTriangle,
    label: 'ÉLEVÉ',
    color: '#E65100',
    bg: '#FFF3E0',
    border: '#FFCC80',
    autoDismiss: false,
  },
  medium: {
    Icon: CircleAlert,
    label: 'MODÉRÉ',
    color: '#F57C00',
    bg: '#FFF8E1',
    border: '#FFE082',
    autoDismiss: true,
  },
  low: {
    Icon: Info,
    label: 'INFO',
    color: '#0277BD',
    bg: '#E1F5FE',
    border: '#81D4FA',
    autoDismiss: true,
  },
};

const SCOPE_LABELS = {
  route: 'Sur votre trajet',
  geo: 'À proximité',
};

const AUTO_DISMISS_MS = 10000; // 10 seconds for non-critical alerts
const MAX_VISIBLE_TOASTS = 3;

export default function NavigationNotifications() {
  const { scopedAlerts, alertCount, dismissAlert, isNavigating } =
    useRouteSessionContext();
  const { sendNotification } = useNotifications();

  const [dismissingIds, setDismissingIds] = useState(new Set());
  const notifiedRef = useRef(new Set());
  const timerMapRef = useRef(new Map());
  const visibleAlerts = useMemo(
    () =>
      isNavigating ? scopedAlerts.slice(0, MAX_VISIBLE_TOASTS) : [],
    [isNavigating, scopedAlerts],
  );

  const handleDismiss = useCallback(
    (alertId) => {
      setDismissingIds((prev) => new Set([...prev, alertId]));

      setTimeout(() => {
        dismissAlert(alertId);
        setDismissingIds((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
      }, 300);
    },
    [dismissAlert]
  );

  useEffect(() => {
    if (!isNavigating) {
      notifiedRef.current.clear();
      timerMapRef.current.forEach((timer) => clearTimeout(timer));
      timerMapRef.current.clear();
      return;
    }

    // Send browser notifications for NEW alerts only
    scopedAlerts.forEach((alert) => {
      if (!notifiedRef.current.has(alert.id)) {
        notifiedRef.current.add(alert.id);
        sendNotification(
          alert.id,
          alert.title || 'Alerte TRAFIQ',
          alert.message || `Incident à ${alert.distance}m`
        );
      }
    });
  }, [scopedAlerts, isNavigating, sendNotification]);

  useEffect(() => {
    const timerMap = timerMapRef.current;

    visibleAlerts.forEach((alert) => {
      const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium;
      if (config.autoDismiss && !timerMap.has(alert.id)) {
        const timer = setTimeout(() => {
          handleDismiss(alert.id);
          timerMap.delete(alert.id);
        }, AUTO_DISMISS_MS);
        timerMap.set(alert.id, timer);
      }
    });

    return () => {
      for (const [id, timer] of timerMap.entries()) {
        if (!visibleAlerts.find((a) => a.id === id)) {
          clearTimeout(timer);
          timerMap.delete(id);
        }
      }
    };
  }, [visibleAlerts, handleDismiss]);

  // Format distance for display
  const formatDistance = (meters) => {
    if (!meters && meters !== 0) return '';
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const getDistanceLabel = (alert) => {
    const distanceText = formatDistance(alert.distance);
    if (!distanceText) return '';
    return alert.scope === 'route'
      ? `${distanceText} du départ`
      : `${distanceText} de vous`;
  };

  // Format timestamp
  const formatTime = (ts) => {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (!isNavigating || visibleAlerts.length === 0) return null;

  return (
    <div className="nav-notif-stack" id="navigation-notifications">
      {visibleAlerts.map((alert) => {
        const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.medium;
        const isDismissing = dismissingIds.has(alert.id);
        const scopeLabel = SCOPE_LABELS[alert.scope] || '';
        const SeverityIcon = config.Icon;

        return (
          <div
            key={alert.id}
            className={`nav-notif-toast ${isDismissing ? 'nav-notif-toast--exit' : ''}`}
            style={{
              '--toast-border': config.border,
              '--toast-bg': config.bg,
              '--toast-color': config.color,
            }}
            id={`nav-notif-${alert.id}`}
          >
            {/* Severity indicator */}
            <div className="nav-notif-toast__indicator" />

            {/* Icon */}
            <div className="nav-notif-toast__icon"><SeverityIcon size={20} aria-hidden="true" /></div>

            {/* Content */}
            <div className="nav-notif-toast__body">
              <div className="nav-notif-toast__header">
                <span
                  className="nav-notif-toast__severity"
                  style={{ color: config.color, background: config.bg }}
                >
                  {config.label}
                </span>
                {scopeLabel && (
                  <span className="nav-notif-toast__scope">{scopeLabel}</span>
                )}
              </div>

              <div className="nav-notif-toast__title">{alert.title}</div>

              <div className="nav-notif-toast__message">{alert.message}</div>

              <div className="nav-notif-toast__meta">
                {alert.distance > 0 && (
                  <span className="nav-notif-toast__distance">
                    <MapPin size={12} aria-hidden="true" /> {getDistanceLabel(alert)}
                  </span>
                )}
                {alert.timestamp && (
                  <span className="nav-notif-toast__time">
                    <Clock3 size={12} aria-hidden="true" /> {formatTime(alert.timestamp)}
                  </span>
                )}
              </div>

              {/* Auto-dismiss progress bar for non-critical */}
              {config.autoDismiss && !isDismissing && (
                <div className="nav-notif-toast__progress">
                  <div
                    className="nav-notif-toast__progress-bar"
                    style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
                  />
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              className="nav-notif-toast__close"
              onClick={() => handleDismiss(alert.id)}
              aria-label="Fermer l'alerte"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        );
      })}

      {/* Overflow badge */}
      {alertCount > MAX_VISIBLE_TOASTS && (
        <div className="nav-notif-overflow">
          +{alertCount - MAX_VISIBLE_TOASTS} autre(s) alerte(s)
        </div>
      )}
    </div>
  );
}
