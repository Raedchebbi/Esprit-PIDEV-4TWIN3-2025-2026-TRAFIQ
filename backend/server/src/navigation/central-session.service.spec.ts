import { ConfigService } from '@nestjs/config';
import { CentralSessionService } from './central-session.service';

describe('CentralSessionService', () => {
  const dto = {
    routeId: 'route_1',
    routeCoords: [
      [36.8068, 10.1816],
      [36.808, 10.183],
    ] as [number, number][],
    origin: { lat: 36.8068, lng: 10.1816 },
    destination: { lat: 36.808, lng: 10.183 },
  };

  function createService(
    flags: Record<string, string>,
    redisClient: unknown = null,
  ) {
    const configService = {
      get: jest.fn((key: string) => flags[key]),
    } as unknown as ConfigService;
    const redisService = {
      getClient: jest.fn().mockResolvedValue(redisClient),
    };
    const userSessionService = {
      trackSessionStarted: jest.fn(),
      trackPositionUpdated: jest.fn(),
      trackSessionEnded: jest.fn(),
    };
    return {
      service: new CentralSessionService(
        configService,
        redisService as never,
        userSessionService as never,
      ),
      redisService,
      userSessionService,
    };
  }

  it('is disabled unless USE_CENTRAL_SESSIONS is true', () => {
    const { service } = createService({ USE_CENTRAL_SESSIONS: 'false' });

    expect(service.useCentralStore()).toBe(false);
  });

  it('creates memory-backed central sessions without Redis', async () => {
    const { service, userSessionService } = createService({
      USE_CENTRAL_SESSIONS: 'true',
      USE_REDIS: 'false',
    });

    const created = await service.createSession(dto);
    const session = await service.getSession(created.sessionId);

    expect(created.sessionId).toMatch(/^nav_/);
    expect(created.sessionToken).toBeTruthy();
    expect(session?.sessionId).toBe(created.sessionId);
    expect(userSessionService.trackSessionStarted).toHaveBeenCalled();
  });

  it('rejects missing tokens in central session mode', async () => {
    const { service } = createService({ USE_CENTRAL_SESSIONS: 'true' });
    const created = await service.createSession(dto);

    await expect(
      service.updatePosition(created.sessionId, { lat: 36.807, lng: 10.182 }),
    ).rejects.toThrow('Invalid navigation session token');
  });

  it('rejects invalid tokens in central session mode', async () => {
    const { service } = createService({ USE_CENTRAL_SESSIONS: 'true' });
    const created = await service.createSession(dto);

    await expect(
      service.updatePosition(
        created.sessionId,
        { lat: 36.807, lng: 10.182 },
        'bad-token',
      ),
    ).rejects.toThrow('Invalid navigation session token');
  });

  it('accepts valid tokens in central session mode', async () => {
    const { service } = createService({ USE_CENTRAL_SESSIONS: 'true' });
    const created = await service.createSession(dto);

    await expect(
      service.updatePosition(
        created.sessionId,
        { lat: 36.807, lng: 10.182 },
        created.sessionToken,
      ),
    ).resolves.toBeDefined();
  });
});
