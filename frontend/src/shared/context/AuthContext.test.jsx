import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

function AuthHarness() {
  const { isAuthenticated, user, login, logout } = useAuth();

  return (
    <div>
      <div data-testid="auth-state">
        {isAuthenticated ? 'authenticated' : 'anonymous'}
      </div>
      <div data-testid="auth-user">{user?.email || 'none'}</div>
      <button type="button" onClick={() => login('admin@trafiq.io', 'secret')}>
        login
      </button>
      <button type="button" onClick={logout}>
        logout
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('hydrates an existing session from sessionStorage', () => {
    sessionStorage.setItem(
      'trafiq_admin',
      JSON.stringify({ email: 'stored@trafiq.io', role: 'ADMIN' }),
    );
    sessionStorage.setItem('trafiq_token', 'stored-token');

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('stored@trafiq.io');
  });

  it('stores the user and token after a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user: { email: 'admin@trafiq.io', role: 'SUPER_ADMIN' },
          access_token: 'token-123',
        }),
      }),
    );

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-state')).toHaveTextContent('authenticated');
    });

    expect(screen.getByTestId('auth-user')).toHaveTextContent('admin@trafiq.io');
    expect(sessionStorage.getItem('trafiq_token')).toBe('token-123');
  });

  it('clears the session on logout', () => {
    sessionStorage.setItem(
      'trafiq_admin',
      JSON.stringify({ email: 'stored@trafiq.io', role: 'ADMIN' }),
    );
    sessionStorage.setItem('trafiq_token', 'stored-token');

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /logout/i }));

    expect(screen.getByTestId('auth-state')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('none');
    expect(sessionStorage.getItem('trafiq_admin')).toBeNull();
    expect(sessionStorage.getItem('trafiq_token')).toBeNull();
  });
});
