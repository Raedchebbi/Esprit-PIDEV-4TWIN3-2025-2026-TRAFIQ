// ── TRAFIQ — API Service (JWT-authenticated) ─────────────────────────────────
import { API_BASE_URL } from '../config/runtimeConfig';

/** Helper: get auth headers from sessionStorage token. */
function authHeaders() {
    const token = sessionStorage.getItem('trafiq_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

export const trafiqApi = {
    // ── Camera Data ───────────────────────────────────────────────────────────
    async getCameras() {
        const res = await fetch(`${API_BASE_URL}/cameras`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`GET /cameras failed: ${res.status}`);
        return res.json();
    },

    // ── Accident Data ─────────────────────────────────────────────────────────
    async getAccidents() {
        const res = await fetch(`${API_BASE_URL}/accidents`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`GET /accidents failed: ${res.status}`);
        return res.json();
    },
    async getActiveAccidents() {
        const res = await fetch(`${API_BASE_URL}/accidents/active`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`GET /accidents/active failed: ${res.status}`);
        return res.json();
    },
    async getSnapshotUrl(filename) {
        const res = await fetch(`${API_BASE_URL}/accidents/snapshot/${filename}`, {
            headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`GET /accidents/snapshot/${filename} failed: ${res.status}`);

        const blob = await res.blob();
        return URL.createObjectURL(blob);
    },

    // ── Vehicle Counts ────────────────────────────────────────────────────────
    async getVehicleCounts() {
        const res = await fetch(`${API_BASE_URL}/vehicle-counts`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`GET /vehicle-counts failed: ${res.status}`);
        return res.json();
    },

    // ── Incident Management ───────────────────────────────────────────────────
    async flagIncidents(ids) {
        const res = await fetch(`${API_BASE_URL}/accidents/flag`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ ids }),
        });
        return res.json();
    },
    async unflagIncidents(ids) {
        const res = await fetch(`${API_BASE_URL}/accidents/unflag`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify({ ids }),
        });
        return res.json();
    },
    async removeIncidents(ids) {
        const res = await fetch(`${API_BASE_URL}/accidents/remove`, {
            method: 'DELETE',
            headers: authHeaders(),
            body: JSON.stringify({ ids }),
        });
        return res.json();
    },

    // ── Admin Management (SUPER_ADMIN only) ───────────────────────────────────
    async listAdmins() {
        const res = await fetch(`${API_BASE_URL}/auth/admins`, { headers: authHeaders() });
        if (!res.ok) throw new Error(`GET /auth/admins failed: ${res.status}`);
        return res.json();
    },
    async createAdmin(data) {
        const res = await fetch(`${API_BASE_URL}/auth/admins`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(data),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.message || `POST /auth/admins failed: ${res.status}`);
        }
        return res.json();
    },
    async updateAdmin(id, data) {
        const res = await fetch(`${API_BASE_URL}/auth/admins/${id}`, {
            method: 'PATCH',
            headers: authHeaders(),
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`PATCH /auth/admins/${id} failed: ${res.status}`);
        return res.json();
    },
    async deleteAdmin(id) {
        const res = await fetch(`${API_BASE_URL}/auth/admins/${id}`, {
            method: 'DELETE',
            headers: authHeaders(),
        });
        if (!res.ok) throw new Error(`DELETE /auth/admins/${id} failed: ${res.status}`);
        return res.json();
    },

    // ── Stubs ─────────────────────────────────────────────────────────────────
    async getEvents() {
        return { ok: false }; // Use mock data from useTrafikData
    },
    async getRoutesStatus() {
        return { ok: false };
    },
};
