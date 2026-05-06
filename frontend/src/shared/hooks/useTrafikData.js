import { useEffect, useMemo, useState } from 'react';
import { publicApi } from '../services/publicApi';

function routeStatusFromCongestion(level) {
  if (level === 'Saturé') return 'blocked';
  if (level === 'Dense' || level === 'Modéré') return 'slow';
  return 'free';
}

function routeColor(status) {
  if (status === 'blocked') return '#B71C1C';
  if (status === 'slow') return '#FF8F00';
  return '#2E7D32';
}

function buildRoutesData(congestionZones) {
  return congestionZones.map((zone) => {
    const status = routeStatusFromCongestion(zone.congestionLevel);
    const extra =
      status === 'blocked' ? null : status === 'slow' ? zone.vehicleCount : 0;

    return {
      id: zone.camera_id,
      name: zone.label,
      status,
      extra,
      color: routeColor(status),
      category: zone.area || 'Zones',
      incident: status === 'blocked',
    };
  });
}

function buildPolylines(congestionZones) {
  return congestionZones.map((zone) => ({
    id: zone.camera_id,
    coords: [[zone.lat, zone.lng]],
    status: routeStatusFromCongestion(zone.congestionLevel),
  }));
}

function computeStats(accidentsGPS, congestionZones) {
  const accidents = accidentsGPS.length;
  const blocked = congestionZones.filter(
    (zone) => routeStatusFromCongestion(zone.congestionLevel) === 'blocked',
  ).length;
  const slow = congestionZones.filter(
    (zone) => routeStatusFromCongestion(zone.congestionLevel) === 'slow',
  ).length;

  const levelDist = accidentsGPS.reduce(
    (acc, incident) => {
      const level = String(incident.risk_level || '').toUpperCase();
      if (level === 'CRITICAL' || level === 'HIGH') acc.L1 += 1;
      else if (level === 'MEDIUM' || level === 'MODERATE') acc.L2 += 1;
      else acc.L3 += 1;
      return acc;
    },
    { L1: 0, L2: 0, L3: 0 },
  );

  const avgRisk = accidentsGPS.length
    ? Math.round(
        (accidentsGPS.reduce(
          (sum, incident) => sum + (Number(incident.risk_score) || 0),
          0,
        ) /
          accidentsGPS.length) *
          100,
      )
    : 0;

  return {
    vehicles: congestionZones.reduce((sum, zone) => sum + (zone.vehicleCount || 0), 0),
    accidents,
    blocked,
    corrections: 0,
    confidence: avgRisk,
    fps: 0,
    precision: Math.max(0, 100 - blocked * 5),
    scenarios: accidents,
    falsePositivesAvoided: 0,
    levelDist,
    pipeline: {
      yolo: { ok: true, value: `${congestionZones.length} zones surveillees` },
      tracking: { ok: true, value: `${congestionZones.length} cameras actives` },
      speed: { ok: true, value: `${congestionZones.length} flux suivis` },
      pairs: { ok: true, value: `${accidents} incidents actifs` },
      deliber: {
        ok: true,
        value: `${blocked} zone(s) bloquee(s), ${slow} dense(s)`,
        running: false,
      },
      bestpt: { ok: true, value: `Risque moyen: ${avgRisk}%` },
      autocorr: { ok: true, value: 'Aucune correction locale' },
    },
  };
}

export function useTrafikData() {
  const [accidentsGPS, setAccidentsGPS] = useState([]);
  const [congestionZones, setCongestionZones] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [incidents, congestion] = await Promise.all([
          publicApi.getPublicIncidents(),
          publicApi.getCongestionData(),
        ]);

        if (!cancelled) {
          setAccidentsGPS(Array.isArray(incidents) ? incidents : []);
          setCongestionZones(Array.isArray(congestion) ? congestion : []);
        }
      } catch {
        if (!cancelled) {
          setAccidentsGPS([]);
          setCongestionZones([]);
        }
      }
    }

    void load();
    const interval = setInterval(() => {
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const routesData = useMemo(
    () => buildRoutesData(congestionZones),
    [congestionZones],
  );
  const polylines = useMemo(
    () => buildPolylines(congestionZones),
    [congestionZones],
  );
  const stats = useMemo(
    () => computeStats(accidentsGPS, congestionZones),
    [accidentsGPS, congestionZones],
  );

  return {
    events: [],
    memory: [],
    stats,
    accidentsGPS,
    vehicleTracks: [],
    routesData,
    polylines,
  };
}
