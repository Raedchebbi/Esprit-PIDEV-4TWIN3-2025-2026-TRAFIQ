// ── TRAFIQ — Admin Management Page (SUPER_ADMIN only) ─────────────────────────
import React, { useState, useEffect, useCallback } from 'react';
import {
    Building2,
    Check,
    Earth,
    Flag,
    Lock,
    Pencil,
    Users,
    X,
    Trash2,
} from 'lucide-react';
import { trafiqApi } from '../../../shared/services/trafiqApi';
import { useAuth } from '../../../shared/context/AuthContext';
import './AdminManagement.css';

const COUNTRIES = [
    'France', 'Spain', 'Astrakhan', 'Tunisia', 'Germany',
    'Italy', 'Morocco', 'Algeria', 'Portugal', 'Belgium',
];

export default function AdminManagement() {
    const { isSuperAdmin } = useAuth();
    const [admins, setAdmins] = useState([]);
    const [showCreate, setShowCreate] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState({ email: '', name: '', password: '', country: COUNTRIES[0] });
    const [editForm, setEditForm] = useState({ name: '', country: '', password: '' });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const load = useCallback(() => {
        trafiqApi.listAdmins()
            .then(setAdmins)
            .catch(() => {});
    }, []);

    useEffect(() => { load(); }, [load]);

    if (!isSuperAdmin) {
        return (
            <div className="adm-mgmt-page">
                <div className="adm-mgmt-forbidden">
                    <Lock className="adm-mgmt-lock" size={44} aria-hidden="true" />
                    <h2>Accès Refusé</h2>
                    <p>Seul le SUPER_ADMIN peut gérer les administrateurs.</p>
                </div>
            </div>
        );
    }

    const handleCreate = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');
        try {
            await trafiqApi.createAdmin(form);
            setSuccess(`Admin ${form.email} créé avec succès → ${form.country}`);
            setForm({ email: '', name: '', password: '', country: COUNTRIES[0] });
            setShowCreate(false);
            load();
        } catch (err) {
            setError(err.message || 'Erreur lors de la création');
        }
    };

    const handleUpdate = async (id) => {
        setError('');
        setSuccess('');
        try {
            const data = {};
            if (editForm.name) data.name = editForm.name;
            if (editForm.country) data.country = editForm.country;
            if (editForm.password) data.password = editForm.password;
            await trafiqApi.updateAdmin(id, data);
            setSuccess('Admin mis à jour avec succès');
            setEditingId(null);
            load();
        } catch (err) {
            setError(err.message || 'Erreur lors de la mise à jour');
        }
    };

    const handleDelete = async (id, email) => {
        if (!confirm(`Supprimer l'admin ${email} ?`)) return;
        setError('');
        setSuccess('');
        try {
            await trafiqApi.deleteAdmin(id);
            setSuccess(`Admin ${email} supprimé`);
            load();
        } catch (err) {
            setError(err.message || 'Erreur lors de la suppression');
        }
    };

    const startEdit = (admin) => {
        setEditingId(admin.id);
        setEditForm({ name: admin.name, country: admin.country || '', password: '' });
    };

    const superAdmins = admins.filter(a => a.role === 'SUPER_ADMIN');
    const countryAdmins = admins.filter(a => a.role === 'ADMIN');

    return (
            <div className="adm-mgmt-page">
            <div className="adm-mgmt-header">
                <div>
                    <h2><Users size={20} aria-hidden="true" /> Gestion des Administrateurs</h2>
                    <p className="adm-mgmt-sub">
                        {admins.length} utilisateur(s) · {countryAdmins.length} admin(s) pays ·
                        {superAdmins.length} super admin(s)
                    </p>
                </div>
                <button
                    className="adm-mgmt-create-btn"
                    onClick={() => setShowCreate(!showCreate)}
                >
                    {showCreate ? <><X size={14} aria-hidden="true" /> Annuler</> : '+ Nouvel Admin'}
                </button>
            </div>

            {/* Success / Error Messages */}
            {success && <div className="adm-mgmt-alert adm-mgmt-success">{success}</div>}
            {error && <div className="adm-mgmt-alert adm-mgmt-error">{error}</div>}

            {/* Create Form */}
            {showCreate && (
                <div className="adm-mgmt-create-card">
                    <h3>Créer un Admin de Pays</h3>
                    <form className="adm-mgmt-form" onSubmit={handleCreate}>
                        <div className="adm-mgmt-form-row">
                            <div className="adm-mgmt-field">
                                <label>Email</label>
                                <input
                                    type="email"
                                    placeholder="admin@example.com"
                                    value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="adm-mgmt-field">
                                <label>Nom complet</label>
                                <input
                                    type="text"
                                    placeholder="Jean Dupont"
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <div className="adm-mgmt-form-row">
                            <div className="adm-mgmt-field">
                                <label>Mot de passe</label>
                                <input
                                    type="password"
                                    placeholder="Mot de passe sécurisé"
                                    value={form.password}
                                    onChange={e => setForm({ ...form, password: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="adm-mgmt-field">
                                <label>Pays assigné</label>
                                <select
                                    value={form.country}
                                    onChange={e => setForm({ ...form, country: e.target.value })}
                                >
                                    {COUNTRIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <button type="submit" className="adm-mgmt-submit-btn">
                            <Check size={14} aria-hidden="true" />
                            Créer l'administrateur
                        </button>
                    </form>
                </div>
            )}

            {/* Super Admins Section */}
            <div className="adm-mgmt-section">
                <h3 className="adm-mgmt-section-title">
                    <Earth className="adm-mgmt-role-icon super" size={18} aria-hidden="true" />
                    Super Administrateurs
                </h3>
                <div className="adm-mgmt-table-wrap">
                    <table className="adm-mgmt-table">
                        <thead>
                            <tr>
                                <th>Utilisateur</th>
                                <th>Email</th>
                                <th>Rôle</th>
                                <th>Portée</th>
                                <th>Créé le</th>
                            </tr>
                        </thead>
                        <tbody>
                            {superAdmins.map(admin => (
                                <tr key={admin.id}>
                                    <td>
                                        <div className="adm-mgmt-user-cell">
                                            <div className="adm-mgmt-avatar super">
                                                {admin.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                            </div>
                                            <span>{admin.name}</span>
                                        </div>
                                    </td>
                                    <td>{admin.email}</td>
                                    <td><span className="adm-mgmt-badge super">SUPER_ADMIN</span></td>
                                    <td><span className="adm-mgmt-scope global"><Earth size={14} aria-hidden="true" /> Global</span></td>
                                    <td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Country Admins Section */}
            <div className="adm-mgmt-section">
                <h3 className="adm-mgmt-section-title">
                    <Building2 className="adm-mgmt-role-icon admin" size={18} aria-hidden="true" />
                    Administrateurs Pays
                </h3>
                {countryAdmins.length === 0 ? (
                    <p className="adm-mgmt-empty">Aucun admin pays. Créez-en un ci-dessus.</p>
                ) : (
                    <div className="adm-mgmt-table-wrap">
                        <table className="adm-mgmt-table">
                            <thead>
                                <tr>
                                    <th>Utilisateur</th>
                                    <th>Email</th>
                                    <th>Rôle</th>
                                    <th>Pays</th>
                                    <th>Créé le</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {countryAdmins.map(admin => (
                                    <tr key={admin.id}>
                                        <td>
                                            <div className="adm-mgmt-user-cell">
                                                <div className="adm-mgmt-avatar admin">
                                                    {admin.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                                </div>
                                                <span>{admin.name}</span>
                                            </div>
                                        </td>
                                        <td>{admin.email}</td>
                                        <td><span className="adm-mgmt-badge admin">ADMIN</span></td>
                                        <td>
                                            {editingId === admin.id ? (
                                                <select
                                                    value={editForm.country}
                                                    onChange={e => setEditForm({ ...editForm, country: e.target.value })}
                                                    className="adm-mgmt-inline-select"
                                                >
                                                    {COUNTRIES.map(c => (
                                                        <option key={c} value={c}>{c}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="adm-mgmt-scope country"><Flag size={14} aria-hidden="true" /> {admin.country}</span>
                                            )}
                                        </td>
                                        <td>{admin.createdAt ? new Date(admin.createdAt).toLocaleDateString() : '—'}</td>
                                        <td>
                                            <div className="adm-mgmt-actions">
                                                {editingId === admin.id ? (
                                                    <>
                                                        <button
                                                            className="adm-mgmt-action-btn save"
                                                            onClick={() => handleUpdate(admin.id)}
                                                        >
                                                            <Check size={14} aria-hidden="true" />
                                                        </button>
                                                        <button
                                                            className="adm-mgmt-action-btn cancel"
                                                            onClick={() => setEditingId(null)}
                                                        >
                                                            <X size={14} aria-hidden="true" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            className="adm-mgmt-action-btn edit"
                                                            onClick={() => startEdit(admin)}
                                                        >
                                                            <Pencil size={14} aria-hidden="true" />
                                                        </button>
                                                        <button
                                                            className="adm-mgmt-action-btn delete"
                                                            onClick={() => handleDelete(admin.id, admin.email)}
                                                        >
                                                            <Trash2 size={14} aria-hidden="true" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
