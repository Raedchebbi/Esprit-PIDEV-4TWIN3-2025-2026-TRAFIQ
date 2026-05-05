import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService production seeding', () => {
  const originalEnv = process.env;

  function createService() {
    const mongoPrimary = {
      isPrimaryEnabled: jest.fn(() => true),
      findUsers: jest.fn().mockResolvedValue([]),
      upsertUser: jest.fn().mockResolvedValue(undefined),
    };
    return new AuthService(
      { sign: jest.fn(() => 'token') } as unknown as JwtService,
      mongoPrimary as never,
    );
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not seed hardcoded defaults in production when initial admin env is missing', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.INITIAL_SUPER_ADMIN_EMAIL;
    delete process.env.INITIAL_SUPER_ADMIN_PASSWORD;
    const service = createService();

    await service.onModuleInit();

    expect(service.listAdmins()).toEqual([]);
  });

  it('seeds initial production super admin from environment', async () => {
    process.env.NODE_ENV = 'production';
    process.env.INITIAL_SUPER_ADMIN_EMAIL = 'owner@example.com';
    process.env.INITIAL_SUPER_ADMIN_PASSWORD = 'VeryStrongPassword123!';
    process.env.INITIAL_SUPER_ADMIN_NAME = 'Owner Admin';
    const service = createService();

    await service.onModuleInit();

    expect(service.listAdmins()).toEqual([
      expect.objectContaining({
        email: 'owner@example.com',
        name: 'Owner Admin',
        role: 'SUPER_ADMIN',
      }),
    ]);
  });
});
