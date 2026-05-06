import { AccidentsService } from '../accidents/accidents.service';
import { CamerasService } from '../cameras/cameras.service';
import { VehicleCountsStore } from '../risk/vehicle-counts.store';
import { PublicApiService } from './public-api.service';

describe('PublicApiService', () => {
  const fetchMock = jest.spyOn(global, 'fetch');

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

  let service: PublicApiService;

  beforeEach(() => {
    jest.mocked(accidentsService.findActive).mockReset();
    jest.mocked(camerasService.findAll).mockReset();
    jest.mocked(vehicleCounts.getLatest).mockReset();
    jest.mocked(vehicleCounts.getLatestAsync).mockReset();
    fetchMock.mockReset();

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 1600,
            duration: 240,
            geometry: {
              coordinates: [
                [2.19252, 47.79407],
                [2.19883, 47.79524],
                [2.2052, 47.79942],
              ],
            },
            legs: [{ steps: [] }],
          },
        ],
      }),
    } as Response);

    jest.mocked(camerasService.findAll).mockReturnValue([
      {
        id: 'cam1',
        label: 'Cam 1',
        area: 'France',
        city: 'France',
        location: { latitude: 47.79524, longitude: 2.19883 },
        media_url: 'cam1.mp4',
      },
      {
        id: 'cam2',
        label: 'Cam 2',
        area: 'France',
        city: 'France',
        location: { latitude: 47.7949, longitude: 2.1967 },
        media_url: 'cam2.mp4',
      },
    ]);

    service = new PublicApiService(
      accidentsService as AccidentsService,
      camerasService as CamerasService,
      vehicleCounts as VehicleCountsStore,
    );
  });

  afterAll(() => {
    fetchMock.mockRestore();
  });

  it('enriches public incidents with camera coordinates', async () => {
    jest.mocked(accidentsService.findActive).mockResolvedValue([
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

    const incidents = await service.getPublicIncidents();

    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({
      incident_id: 'inc_1',
      camera_id: 'cam1',
      lat: 47.79524,
      lng: 2.19883,
      area: 'France',
      city: 'France',
    });
  });

  it('returns AI-labelled route suggestions for the planner', async () => {
    jest.mocked(accidentsService.findActive).mockResolvedValue([]);
    jest.mocked(vehicleCounts.getLatestAsync).mockResolvedValue({
      total: 0,
      per_camera: [{ cam_id: 'cam1', count: 18 }],
      timestamp: '2026-04-26T12:00:00.000Z',
    });

    const routes = await service.suggestRoutes({
      originLat: 47.79407,
      originLng: 2.19252,
      destLat: 47.79942,
      destLng: 2.2052,
    });

    expect(routes).toHaveLength(3);
    expect(routes[0].coords[0]).toEqual([47.79407, 2.19252]);
    expect(routes[0].coords[routes[0].coords.length - 1]).toEqual([
      47.79942,
      2.2052,
    ]);
    expect(routes.some((route) => route.roads.includes('Camera corridor France'))).toBe(
      true,
    );
    expect(routes[0].aiLabel).toBeDefined();
    expect(Array.isArray(routes[0].activeIncidents)).toBe(true);
    expect(['RECOMMENDED', 'ALTERNATIVE', 'NOT_RECOMMENDED']).toContain(
      routes[0].aiLabel,
    );
  });
});
