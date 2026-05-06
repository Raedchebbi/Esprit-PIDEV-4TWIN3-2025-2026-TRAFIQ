import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouteSession } from './useRouteSession';

vi.mock('../services/publicApi', () => ({
  publicApi: {
    startNavigation: vi.fn(),
    endNavigation: vi.fn(),
    updatePosition: vi.fn(),
    getSessionAlerts: vi.fn(),
  },
}));

import { publicApi } from '../services/publicApi';

describe('useRouteSession', () => {
  beforeEach(() => {
    vi.mocked(publicApi.startNavigation).mockReset();
    vi.mocked(publicApi.endNavigation).mockReset();
    vi.mocked(publicApi.updatePosition).mockReset();
    vi.mocked(publicApi.getSessionAlerts).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts a real backend-backed navigation session', async () => {
    vi.mocked(publicApi.startNavigation).mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
    });

    const { result } = renderHook(() => useRouteSession());

    const route = {
      id: 1,
      coords: [
        [47.79407, 2.19252],
        [47.79942, 2.2052],
      ],
    };

    await act(async () => {
      await result.current.startNavigation(route);
    });

    expect(publicApi.startNavigation).toHaveBeenCalled();
    expect(result.current.sessionId).toBe('session-1');
    expect(result.current.sessionToken).toBe('token-1');
    expect(result.current.isNavigating).toBe(true);
    expect(result.current.lastError).toBeNull();
  });

  it('does not create a fake local session when navigation start fails', async () => {
    vi.mocked(publicApi.startNavigation).mockRejectedValue(new Error('503'));

    const { result } = renderHook(() => useRouteSession());

    const route = {
      id: 1,
      coords: [
        [47.79407, 2.19252],
        [47.79942, 2.2052],
      ],
    };

    await act(async () => {
      await result.current.startNavigation(route);
    });

    expect(result.current.sessionId).toBeNull();
    expect(result.current.isNavigating).toBe(false);
    expect(result.current.lastError).toBe('503');
  });
});
