const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const trafiqApi = {
    async getCameras() {
        const res = await fetch(`${API_BASE}/cameras`);
        if (!res.ok) throw new Error(`GET /cameras failed: ${res.status}`);
        return res.json();
    },
    async getAccidents() {
        const res = await fetch(`${API_BASE}/accidents`);
        if (!res.ok) throw new Error(`GET /accidents failed: ${res.status}`);
        return res.json();
    },
    async getActiveAccidents() {
        const res = await fetch(`${API_BASE}/accidents/active`);
        if (!res.ok) throw new Error(`GET /accidents/active failed: ${res.status}`);
        return res.json();
    },
    async getVehicleCounts() {
        const res = await fetch(`${API_BASE}/vehicle-counts`);
        if (!res.ok) throw new Error(`GET /vehicle-counts failed: ${res.status}`);
        return res.json();
    },
    async getEvents() {
        return { ok: false }; // Use mock data from useTrafikData
    },
    async getRoutesStatus() {
        return { ok: false };
    },
};
