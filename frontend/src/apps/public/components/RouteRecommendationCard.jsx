// ── TRAFIQ — Route Recommendation Card ───────────────────────────────────────
// Enhanced route card with AI confidence labels, real-time risk scoring,
// active incident count, congestion indicators, and "Start Navigation" action.

import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  Circle,
  CircleOff,
  Clock3,
  RefreshCw,
  Ruler,
  TriangleAlert,
} from 'lucide-react';
import { useRouteSessionContext } from '../../../shared/context/RouteSessionContext';
import './RouteRecommendationCard.css';

const AI_LABELS = {
  RECOMMENDED: {
    text: 'RECOMMANDÉ PAR IA',
    Icon: CircleCheck,
    className: 'rec-card__label--recommended',
  },
  ALTERNATIVE: {
    text: 'ALTERNATIVE',
    Icon: RefreshCw,
    className: 'rec-card__label--alternative',
  },
  NOT_RECOMMENDED: {
    text: 'NON RECOMMANDÉ',
    Icon: CircleOff,
    className: 'rec-card__label--avoid',
  },
};

const CONGESTION_LEVELS = {
  Fluide: { color: '#2E7D32', bg: '#E8F5E9' },
  Modéré: { color: '#F57C00', bg: '#FFF3E0' },
  Dense: { color: '#E65100', bg: '#FBE9E7' },
  Saturé: { color: '#B71C1C', bg: '#FFEBEE' },
};

export default function RouteRecommendationCard({ route, selected, onSelect }) {
  const { startNavigation, isNavigating } = useRouteSessionContext();
  const [isStarting, setIsStarting] = useState(false);

  const {
    id,
    label = `Trajet ${id || ''}`,
    roads = [],
    time,
    dist,
    riskScore = 0,
    congestionLevel = 'Fluide',
    activeIncidents = [],
    status,
    labelColor,
    labelBg,
    incidents = 0,
    aiLabel,
  } = route;

  const resolvedAiLabel =
    aiLabel ||
    (status === 'free'
      ? 'RECOMMENDED'
      : status === 'blocked'
        ? 'NOT_RECOMMENDED'
        : 'ALTERNATIVE');

  const aiConfig = AI_LABELS[resolvedAiLabel] || AI_LABELS.ALTERNATIVE;
  const congestion = CONGESTION_LEVELS[congestionLevel] || CONGESTION_LEVELS.Modéré;
  const AiLabelIcon = aiConfig.Icon;

  const riskDisplay = useMemo(() => {
    const normalizedScore =
      typeof riskScore === 'number' && riskScore >= 0 && riskScore <= 1
        ? riskScore * 100
        : Number(riskScore);
    const score = Math.round(Math.min(100, Math.max(0, normalizedScore)));

    if (score <= 30) return { label: 'Faible', color: '#2E7D32', width: score };
    if (score <= 60) return { label: 'Modéré', color: '#F57C00', width: score };
    if (score <= 80) return { label: 'Élevé', color: '#E65100', width: score };
    return { label: 'Critique', color: '#B71C1C', width: score };
  }, [riskScore]);

  const incidentCount =
    typeof activeIncidents === 'number'
      ? activeIncidents
      : Array.isArray(activeIncidents)
        ? activeIncidents.length
        : incidents;

  const handleStartNavigation = async () => {
    if (isNavigating || isStarting) return;
    setIsStarting(true);
    try {
      await startNavigation(route);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div
      className={`rec-card ${selected ? 'rec-card--selected' : ''} ${
        resolvedAiLabel === 'NOT_RECOMMENDED' ? 'rec-card--avoid' : ''
      }`}
      onClick={() => onSelect && onSelect(route)}
      id={`route-recommendation-${id}`}
    >
        {/* AI Label Badge */}
      <div className="rec-card__top">
        <span className={`rec-card__label ${aiConfig.className}`}>
          <AiLabelIcon size={14} strokeWidth={2.2} aria-hidden="true" />
          {aiConfig.text}
        </span>
        {labelColor && labelBg && (
          <span
            className="rec-card__route-badge"
            style={{ color: labelColor, background: labelBg }}
          >
            {label}
          </span>
        )}
      </div>

      {/* Route name / roads */}
      <div className="rec-card__roads">
        {roads.length > 0 ? roads.join(' → ') : label}
      </div>

      {/* Stats row */}
      <div className="rec-card__stats">
        <div className="rec-card__stat">
          <Clock3 className="rec-card__stat-icon" size={14} aria-hidden="true" />
          <span className="rec-card__stat-text">{time || '—'} min</span>
        </div>
        <div className="rec-card__stat">
          <Ruler className="rec-card__stat-icon" size={14} aria-hidden="true" />
          <span className="rec-card__stat-text">{dist || '—'} km</span>
        </div>
        <div className="rec-card__stat">
          <Circle
            className="rec-card__stat-icon"
            size={14}
            fill={congestion.color}
            color={congestion.color}
            strokeWidth={0}
            aria-hidden="true"
          />
          <span
            className="rec-card__stat-text"
            style={{ color: congestion.color }}
          >
            {congestionLevel}
          </span>
        </div>
      </div>

      {/* Risk score bar */}
      <div className="rec-card__risk">
        <div className="rec-card__risk-header">
          <span className="rec-card__risk-label">Risque</span>
          <span
            className="rec-card__risk-value"
            style={{ color: riskDisplay.color }}
          >
            {riskDisplay.label} ({riskDisplay.width}%)
          </span>
        </div>
        <div className="rec-card__risk-track">
          <div
            className="rec-card__risk-fill"
            style={{
              width: `${riskDisplay.width}%`,
              background: riskDisplay.color,
            }}
          />
        </div>
      </div>

      {/* Incident info */}
      {incidentCount > 0 ? (
        <div className="rec-card__incidents rec-card__incidents--active">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{incidentCount} incident(s) actif(s) sur ce trajet</span>
        </div>
      ) : (
        <div className="rec-card__incidents rec-card__incidents--clear">
          <CircleCheck size={14} aria-hidden="true" />
          <span>Aucun incident signalé</span>
        </div>
      )}

      {/* Start Navigation button */}
      <button
        className={`rec-card__nav-btn ${
          resolvedAiLabel === 'NOT_RECOMMENDED'
            ? 'rec-card__nav-btn--danger'
            : ''
        }`}
        onClick={(e) => {
          e.stopPropagation();
          handleStartNavigation();
        }}
        disabled={isStarting || isNavigating}
        id={`start-nav-${id}`}
      >
        {isStarting ? (
          <>
            <span className="rec-card__spinner" />
            Démarrage...
          </>
        ) : isNavigating ? (
          'Navigation en cours…'
        ) : resolvedAiLabel === 'NOT_RECOMMENDED' ? (
          <>
            <TriangleAlert size={14} aria-hidden="true" />
            Utiliser quand même
          </>
        ) : (
          <>
            <ArrowRight size={14} aria-hidden="true" />
            Démarrer la navigation
          </>
        )}
      </button>
    </div>
  );
}
