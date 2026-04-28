import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NavigationOverlay from './NavigationOverlay';

const mockEndNavigation = vi.fn();

vi.mock('../../../shared/context/RouteSessionContext', () => ({
  useRouteSessionContext: () => ({
    isNavigating: true,
    activeRoute: {
      id: 1,
      label: 'Trajet Test',
      coords: [
        [36.8068, 10.1816],
        [36.808, 10.183],
      ],
    },
    position: { lat: 36.8068, lng: 10.1816 },
    speed: 10,
    heading: 90,
    alertCount: 2,
    endNavigation: mockEndNavigation,
  }),
}));

describe('NavigationOverlay', () => {
  it('renders active navigation state', () => {
    render(<NavigationOverlay />);

    expect(screen.getByText(/Trajet Test/i)).toBeInTheDocument();
    expect(screen.getByText(/En navigation/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('calls endNavigation from the context', () => {
    render(<NavigationOverlay />);

    fireEvent.click(screen.getByRole('button', { name: /Terminer la navigation/i }));

    expect(mockEndNavigation).toHaveBeenCalled();
  });
});
