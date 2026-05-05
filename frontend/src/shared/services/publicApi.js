// ── TRAFIQ — Public API Service (Unauthenticated) ─────────────────────────────
// Frontend service for citizen app public endpoints. No JWT required.

import { API_BASE_URL } from '../config/runtimeConfig';

export const publicApi = {
  // ── Public Incidents (with GPS) ───────────────────────────────────────────
  async getPublicIncidents() {
    const res = await fetch(`${API_BASE_URL}/public/incidents`);
    if (!res.ok) throw new Error(`GET /public/incidents failed: ${res.status}`);
    return res.json();
  },

  // ── Congestion Data ───────────────────────────────────────────────────────
  async getCongestionData() {
    const res = await fetch(`${API_BASE_URL}/public/congestion`);
    if (!res.ok)
      throw new Error(`GET /public/congestion failed: ${res.status}`);
    return res.json();
  },

  // ── Route Suggestions ─────────────────────────────────────────────────────
  async suggestRoutes(originLat, originLng, destLat, destLng) {
    const res = await fetch(`${API_BASE_URL}/public/routes/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originLat, originLng, destLat, destLng }),
    });
    if (!res.ok)
      throw new Error(`POST /public/routes/suggest failed: ${res.status}`);
    return res.json();
  },

  // ── Navigation Session ────────────────────────────────────────────────────
  async startNavigation(routeId, routeCoords, origin, destination) {
    const res = await fetch(`${API_BASE_URL}/public/navigation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routeId, routeCoords, origin, destination }),
    });
    if (!res.ok)
      throw new Error(`POST /public/navigation/start failed: ${res.status}`);
    return res.json();
  },

  async updatePosition(
    sessionId,
    lat,
    lng,
    heading,
    speed,
    accuracy,
    sessionToken,
  ) {
    const res = await fetch(
      `${API_BASE_URL}/public/navigation/${sessionId}/position`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          heading,
          speed,
          accuracy,
          sessionToken,
        }),
      },
    );
    if (!res.ok)
      throw new Error(
        `PATCH /public/navigation/${sessionId}/position failed: ${res.status}`,
      );
    return res.json();
  },

  async getSessionAlerts(sessionId) {
    const res = await fetch(
      `${API_BASE_URL}/public/navigation/${sessionId}/alerts`,
    );
    if (!res.ok)
      throw new Error(
        `GET /public/navigation/${sessionId}/alerts failed: ${res.status}`,
      );
    return res.json();
  },

  async endNavigation(sessionId, sessionToken) {
    const res = await fetch(`${API_BASE_URL}/public/navigation/${sessionId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    });
    if (!res.ok)
      throw new Error(
        `DELETE /public/navigation/${sessionId} failed: ${res.status}`,
      );
    return res.json();
  },
};
