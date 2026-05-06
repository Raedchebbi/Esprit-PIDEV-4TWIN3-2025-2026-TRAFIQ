import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RouteRecommendationCard from './RouteRecommendationCard';

const mockStartNavigation = vi.fn();

vi.mock('../../../shared/context/RouteSessionContext', () => ({
  useRouteSessionContext: () => ({
    startNavigation: mockStartNavigation,
    isNavigating: false,
  }),
}));

describe('RouteRecommendationCard', () => {
  const route = {
    id: 1,
    label: 'RECOMMANDÉ PAR IA',
    aiLabel: 'RECOMMENDED',
    roads: ['A1', 'Blvd Mohamed V'],
    time: 18,
    dist: 7.2,
    riskScore: 12,
    congestionLevel: 'Fluide',
    activeIncidents: 0,
  };

  beforeEach(() => {
    mockStartNavigation.mockReset();
  });

  it('renders backend-driven route details', () => {
    render(<RouteRecommendationCard route={route} selected={false} />);

    expect(screen.getByText(/RECOMMANDÉ PAR IA/i)).toBeInTheDocument();
    expect(screen.getByText(/A1/)).toBeInTheDocument();
    expect(screen.getByText(/18 min/)).toBeInTheDocument();
    expect(screen.getByText(/Aucun incident signalé/i)).toBeInTheDocument();
  });

  it('normalizes backend risk scores expressed as fractions', () => {
    render(
      <RouteRecommendationCard
        route={{
          ...route,
          riskScore: 0.42,
          aiLabel: 'ALTERNATIVE',
          label: 'ALTERNATIF +4 min',
        }}
        selected={false}
      />,
    );

    expect(screen.getByText(/Modéré/i)).toBeInTheDocument();
    expect(screen.getByText(/42%/i)).toBeInTheDocument();
  });

  it('starts navigation when the CTA is clicked', async () => {
    render(<RouteRecommendationCard route={route} selected={false} />);

    fireEvent.click(screen.getByRole('button', { name: /démarrer la navigation/i }));

    expect(mockStartNavigation).toHaveBeenCalledWith(route);
  });
});
