import * as fs from 'fs';
import { JwtService } from '@nestjs/jwt';
import * as os from 'os';
import * as path from 'path';
import { AuthService } from './auth.service';

describe('AuthService production seeding', () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd();
  let tempDir: string | null = null;

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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trafiq-auth-'));
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  afterAll(() => {
    process.chdir(originalCwd);
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

  it('seeds non-production demo users for France, Astrakhan, and Spain', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.INITIAL_SUPER_ADMIN_EMAIL;
    delete process.env.INITIAL_SUPER_ADMIN_PASSWORD;
    delete process.env.SEED_DEMO_USERS;
    const service = createService();

    await service.onModuleInit();

    expect(service.listAdmins()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'super@trafiq.ai',
          role: 'SUPER_ADMIN',
        }),
        expect.objectContaining({
          email: 'admin@trafiq.ai',
          role: 'ADMIN',
          country: 'France',
        }),
        expect.objectContaining({
          email: 'astrakhan@trafiq.ai',
          role: 'ADMIN',
          country: 'Astrakhan',
        }),
        expect.objectContaining({
          email: 'spain@trafiq.ai',
          role: 'ADMIN',
          country: 'Spain',
        }),
      ]),
    );
  });
});
