import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import IncidentCard from './IncidentCard';

vi.mock('../../../shared/services/trafiqApi', () => ({
  trafiqApi: {
    getSnapshotUrl: vi.fn(),
  },
}));

import { trafiqApi } from '../../../shared/services/trafiqApi';

describe('IncidentCard snapshots', () => {
  beforeEach(() => {
    vi.mocked(trafiqApi.getSnapshotUrl).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the snapshot through the authenticated API service', async () => {
    vi.mocked(trafiqApi.getSnapshotUrl).mockResolvedValue(
      'blob:http://localhost/snapshot-1',
    );

    render(
      <MemoryRouter>
        <IncidentCard
          incident={{
            id: 'inc-1',
            type: 'Collision',
            severity: 'high',
            vehicles: '#1 -> #2',
            conf: 0.8,
            level: 'CRITICAL',
            snapshot: 'snapshot_1.jpg',
            timestamp: '2026-05-06 01:34:12',
            camera_id: 'cam0',
            false_positive: false,
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /snapshot/i }));

    await waitFor(() => {
      expect(trafiqApi.getSnapshotUrl).toHaveBeenCalledWith('snapshot_1.jpg');
    });

    expect(await screen.findByAltText('accident snapshot')).toHaveAttribute(
      'src',
      'blob:http://localhost/snapshot-1',
    );
  });

  it('shows an error when the snapshot fetch fails', async () => {
    vi.mocked(trafiqApi.getSnapshotUrl).mockRejectedValue(new Error('401'));

    render(
      <MemoryRouter>
        <IncidentCard
          incident={{
            id: 'inc-1',
            type: 'Collision',
            severity: 'high',
            vehicles: '#1 -> #2',
            conf: 0.8,
            level: 'CRITICAL',
            snapshot: 'snapshot_1.jpg',
            timestamp: '2026-05-06 01:34:12',
            camera_id: 'cam0',
            false_positive: false,
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /snapshot/i }));

    expect(
      await screen.findByText('Impossible de charger le snapshot.'),
    ).toBeInTheDocument();
  });
});
