import { AccidentsService } from '../accidents/accidents.service';
import { CamerasService } from '../cameras/cameras.service';
import { VehicleCountsStore } from '../risk/vehicle-counts.store';
import { PublicApiService } from './public-api.service';

describe('PublicApiService', () => {
  const accidentsService = {
    findActive: jest.fn(),
  } as unknown as Pick<AccidentsService, 'findActive'>;

  const camerasService = {
    findAll: jest.fn(),
  } as unknown as Pick<CamerasService, 'findAll'>;

  const vehicleCounts = {
    getLatest: jest.fn(),
  } as unknown as Pick<VehicleCountsStore, 'getLatest'>;

  let service: PublicApiService;

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

    service = new PublicApiService(
      accidentsService as AccidentsService,
      camerasService as CamerasService,
      vehicleCounts as VehicleCountsStore,
    );
  });

  it('enriches public incidents with camera coordinates', () => {
    jest.mocked(accidentsService.findActive).mockReturnValue([
      {
        incident_id: 'inc_1',
        incident_type: 'vehicle_collision',
        timestamp: '2026-04-26T12:00:00.000Z',
        camera_id: 'cam1',
        risk_score: 0.8,
        risk_level: 'HIGH',
        risk_reason: 'Collision detected',
        confidence: 0.91,
      },
    ]);

    const incidents = service.getPublicIncidents();

    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      incident_id: 'inc_1',
      camera_id: 'cam1',
      lat: 36.8068,
      lng: 10.1816,
      area: 'Tunis',
      city: 'Tunis',
    });
  });

  it('returns AI-labelled route suggestions for the planner', () => {
    jest.mocked(accidentsService.findActive).mockReturnValue([]);
    jest.mocked(vehicleCounts.getLatest).mockReturnValue({
      total: 0,
      per_camera: [],
      timestamp: '2026-04-26T12:00:00.000Z',
    });

    const routes = service.suggestRoutes({
      originLat: 36.8068,
      originLng: 10.1816,
      destLat: 36.809,
      destLng: 10.19,
    });

    expect(routes.length).toBeGreaterThan(0);
    expect(routes[0].coords[0]).toEqual([36.8068, 10.1816]);
    expect(routes[0].aiLabel).toBeDefined();
    expect(['RECOMMENDED', 'ALTERNATIVE', 'NOT_RECOMMENDED']).toContain(
      routes[0].aiLabel,
    );
  });
});
