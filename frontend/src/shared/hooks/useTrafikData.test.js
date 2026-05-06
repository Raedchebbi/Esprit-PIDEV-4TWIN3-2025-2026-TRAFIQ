import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTrafikData } from './useTrafikData';

vi.mock('../services/publicApi', () => ({
  publicApi: {
    getPublicIncidents: vi.fn(),
    getCongestionData: vi.fn(),
  },
}));

import { publicApi } from '../services/publicApi';

describe('useTrafikData', () => {
  beforeEach(() => {
    vi.mocked(publicApi.getPublicIncidents).mockReset();
    vi.mocked(publicApi.getCongestionData).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates public traffic state from backend endpoints', async () => {
    vi.mocked(publicApi.getPublicIncidents).mockResolvedValue([
      {
        incident_id: 'inc-1',
        incident_type: 'vehicle_collision',
        camera_id: 'cam0',
        risk_level: 'HIGH',
        risk_score: 0.9,
        lat: 47.79524,
        lng: 2.19883,
        active: true,
      },
    ]);
    vi.mocked(publicApi.getCongestionData).mockResolvedValue([
      {
        camera_id: 'cam0',
        label: 'France camera',
        area: 'France',
        lat: 47.79524,
        lng: 2.19883,
        vehicleCount: 16,
        congestionLevel: 'Dense',
      },
    ]);

    const { result } = renderHook(() => useTrafikData());

    await waitFor(() => {
      expect(result.current.accidentsGPS).toHaveLength(1);
    });

    expect(result.current.routesData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cam0',
          category: 'France',
          status: 'slow',
        }),
      ]),
    );
    expect(result.current.stats.accidents).toBe(1);
  });
});
