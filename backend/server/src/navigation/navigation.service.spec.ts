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
    getLatestAsync: jest.fn(),
  } as unknown as Pick<VehicleCountsStore, 'getLatest' | 'getLatestAsync'>;

  const userSessionService = {
    trackSessionStarted: jest.fn(),
    trackPositionUpdated: jest.fn(),
    trackSessionEnded: jest.fn(),
  };

  const centralSessionService = {
    useCentralStore: jest.fn(() => false),
  };

  let service: NavigationService;

  beforeEach(() => {
    jest.mocked(accidentsService.findActive).mockReset();
    jest.mocked(camerasService.findAll).mockReset();
    jest.mocked(vehicleCounts.getLatest).mockReset();
    jest.mocked(vehicleCounts.getLatestAsync).mockReset();

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
      userSessionService as never,
      centralSessionService as never,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('returns scoped accident and congestion alerts for an active session', async () => {
    jest.mocked(accidentsService.findActive).mockResolvedValue([
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

    jest.mocked(vehicleCounts.getLatestAsync).mockResolvedValue({
      total: 24,
      per_camera: [{ cam_id: 'cam1', count: 24 }],
      timestamp: '2026-04-26T12:00:00.000Z',
    });

    const { sessionId } = await service.startSession({
      routeId: 'route_1',
      routeCoords: [
        [36.8068, 10.1816],
        [36.808, 10.183],
      ],
      origin: { lat: 36.8068, lng: 10.1816 },
      destination: { lat: 36.808, lng: 10.183 },
    });

    await service.updatePosition(sessionId, {
      lat: 36.8068,
      lng: 10.1816,
      speed: 12,
      heading: 90,
    });

    const alerts = await service.getAlerts(sessionId);

    expect(alerts.some((alert) => alert.type === 'accident')).toBe(true);
    expect(alerts.some((alert) => alert.type === 'congestion')).toBe(true);
  });

  it('marks nearby incidents as relevant for subscribed sessions', async () => {
    const { sessionId } = await service.startSession({
      routeId: 'route_1',
      routeCoords: [
        [36.8068, 10.1816],
        [36.808, 10.183],
      ],
      origin: { lat: 36.8068, lng: 10.1816 },
      destination: { lat: 36.808, lng: 10.183 },
    });

    const relevance = await service.isIncidentRelevant('cam1', sessionId);

    expect(relevance.relevant).toBe(true);
    expect(relevance.scope).toBe('route');
    expect(relevance.distance).toBeGreaterThanOrEqual(0);
  });

  it('keeps legacy mode tokenless when central sessions are disabled', async () => {
    const { sessionId } = await service.startSession({
      routeId: 'route_1',
      routeCoords: [
        [36.8068, 10.1816],
        [36.808, 10.183],
      ],
      origin: { lat: 36.8068, lng: 10.1816 },
      destination: { lat: 36.808, lng: 10.183 },
    });

    await expect(
      service.updatePosition(sessionId, { lat: 36.807, lng: 10.182 }),
    ).resolves.toBeUndefined();
  });
});
