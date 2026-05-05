import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './redis-io.adapter';

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    duplicate: jest.fn(() => ({
      on: jest.fn(),
      connect: jest.fn().mockRejectedValue(new Error('redis down')),
    })),
    on: jest.fn(),
    connect: jest.fn().mockRejectedValue(new Error('redis down')),
  })),
}));

describe('RedisIoAdapter', () => {
  it('does not fail startup when Redis is disabled', async () => {
    const adapter = new RedisIoAdapter(
      {} as never,
      {
        get: jest.fn(() => 'false'),
      } as unknown as ConfigService,
    );

    await expect(adapter.connectToRedis()).resolves.toBeUndefined();
  });

  it('falls back to local adapter when Redis connection fails', async () => {
    const adapter = new RedisIoAdapter(
      {} as never,
      {
        get: jest.fn((key: string, fallback?: string) => {
          if (key === 'USE_REDIS') return 'true';
          return fallback;
        }),
      } as unknown as ConfigService,
    );

    await expect(adapter.connectToRedis()).resolves.toBeUndefined();
  });
});
