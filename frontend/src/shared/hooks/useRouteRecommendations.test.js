import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRouteRecommendations } from './useRouteRecommendations';

vi.mock('../services/publicApi', () => ({
  publicApi: {
    suggestRoutes: vi.fn(),
  },
}));

import { publicApi } from '../services/publicApi';

describe('useRouteRecommendations', () => {
  beforeEach(() => {
    vi.mocked(publicApi.suggestRoutes).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses freeform coordinate inputs and requests route suggestions', async () => {
    vi.mocked(publicApi.suggestRoutes).mockResolvedValue([
      {
        id: 1,
        label: 'RECOMMANDÉ PAR IA',
        status: 'free',
        activeIncidents: [
          {
            incident_id: 'inc-1',
            camera_id: 'cam0',
            lat: 47.79524,
            lng: 2.19883,
          },
        ],
        coords: [
          [47.79407, 2.19252],
          [47.79942, 2.2052],
        ],
      },
    ]);

    const { result } = renderHook(() => useRouteRecommendations());

    await act(async () => {
      await result.current.fetchRoutes(
        '47.79407, 2.19252',
        '47.79942, 2.20520',
        null,
      );
    });

    expect(publicApi.suggestRoutes).toHaveBeenCalledWith(
      47.79407,
      2.19252,
      47.79942,
      2.2052,
    );
    expect(result.current.routes).toHaveLength(1);
    expect(result.current.routes[0].activeIncidents).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('rejects invalid coordinate input', async () => {
    const { result } = renderHook(() => useRouteRecommendations());

    await act(async () => {
      await result.current.fetchRoutes('France', 'Spain', null);
    });

    expect(publicApi.suggestRoutes).not.toHaveBeenCalled();
    expect(result.current.routes).toEqual([]);
    expect(result.current.error).toBe(
      'Entrez les coordonnees au format "latitude, longitude".',
    );
  });
});
