import { AccidentsService } from '../accidents/accidents.service';
import { CamerasService } from '../cameras/cameras.service';
import { VehicleCountsStore } from '../risk/vehicle-counts.store';
import { NavigationService } from './navigation.service';

describe('NavigationService', () => {
  const accidentsService = {
    findActive: jest.fn(),
  } as unknown as Pick<AccidentsService, 'findActive'>;

  const camerasService = {
    findAll: jest.fn(),
  } as unknown as Pick<CamerasService, 'findAll'>;

  const vehicleCounts = {
    getLatest: jest.fn(),
  } as unknown as Pick<VehicleCountsStore, 'getLatest'>;

  let service: NavigationService;

  beforeEach(() => {
    jest.mocked(accidentsService.findActive).mockReset();
    jest.mocked(camerasService.findAll).mockReset();
    jest.mocked(vehicleCounts.getLatest).mockReset();

    jest.mocked(camerasService.findAll).mockReturnValue([
      {
        id: 'cam1',
        label: 'Cam 1',
        area: 'Tunis',
        city: 'Tunis',
        location: { latitude: 36.8068, longitude: 10.1816 },
        media_url: 'cam1.mp4',
      },
    ]);

    service = new NavigationService(
      accidentsService as AccidentsService,
      camerasService as CamerasService,
      vehicleCounts as VehicleCountsStore,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('returns scoped accident and congestion alerts for an active session', () => {
    jest.mocked(accidentsService.findActive).mockReturnValue([
      {
        incident_id: 'inc_1',
        incident_type: 'vehicle_collision',
        timestamp: '2026-04-26T12:00:00.000Z',
        camera_id: 'cam1',
        risk_level: 'HIGH',
        risk_reason: 'Collision detected',
        confidence: 0.87,
      },
    ]);

    jest.mocked(vehicleCounts.getLatest).mockReturnValue({
      total: 24,
      per_camera: [{ cam_id: 'cam1', count: 24 }],
      timestamp: '2026-04-26T12:00:00.000Z',
    });

    const { sessionId } = service.startSession({
      routeId: 'route_1',
      routeCoords: [
        [36.8068, 10.1816],
        [36.808, 10.183],
      ],
      origin: { lat: 36.8068, lng: 10.1816 },
      destination: { lat: 36.808, lng: 10.183 },
    });

    service.updatePosition(sessionId, {
      lat: 36.8068,
      lng: 10.1816,
      speed: 12,
      heading: 90,
    });

    const alerts = service.getAlerts(sessionId);

    expect(alerts.some((alert) => alert.type === 'accident')).toBe(true);
    expect(alerts.some((alert) => alert.type === 'congestion')).toBe(true);
  });

  it('marks nearby incidents as relevant for subscribed sessions', () => {
    const { sessionId } = service.startSession({
      routeId: 'route_1',
      routeCoords: [
        [36.8068, 10.1816],
        [36.808, 10.183],
      ],
      origin: { lat: 36.8068, lng: 10.1816 },
      destination: { lat: 36.808, lng: 10.183 },
    });

    const relevance = service.isIncidentRelevant('cam1', sessionId);

    expect(relevance.relevant).toBe(true);
    expect(relevance.scope).toBe('route');
    expect(relevance.distance).toBeGreaterThanOrEqual(0);
  });
});
