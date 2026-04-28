// ── TRAFIQ — AuthContext (JWT-based hierarchical auth) ────────────────────────
import React, { createContext, useContext, useState } from 'react';
import { API_BASE_URL } from '../config/runtimeConfig';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const stored = sessionStorage.getItem('trafiq_admin');
        return stored ? JSON.parse(stored) : null;
    });

    const [token, setToken] = useState(() => {
        return sessionStorage.getItem('trafiq_token') || null;
    });

    const login = async (email, password) => {
        try {
            const res = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            if (!res.ok) {
                return false;
            }

            const data = await res.json();
            const userData = data.user;
            const accessToken = data.access_token;

            sessionStorage.setItem('trafiq_admin', JSON.stringify(userData));
            sessionStorage.setItem('trafiq_token', accessToken);
            setUser(userData);
            setToken(accessToken);
            return true;
        } catch {
            return false;
        }
    };

    const logout = () => {
        sessionStorage.removeItem('trafiq_admin');
        sessionStorage.removeItem('trafiq_token');
        setUser(null);
        setToken(null);
    };

    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const isAdmin = user?.role === 'ADMIN';

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                login,
                logout,
                isAuthenticated: !!user && !!token,
                isSuperAdmin,
                isAdmin,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
