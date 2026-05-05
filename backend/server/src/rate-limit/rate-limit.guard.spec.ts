import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  function context(): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn(() => ({
        getRequest: () => ({
          ip: '127.0.0.1',
          headers: {},
          socket: { remoteAddress: '127.0.0.1' },
        }),
      })),
    } as unknown as ExecutionContext;
  }

  it('rate limits after configured threshold', () => {
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => {
        if (key === RATE_LIMIT_KEY) {
          return { key: 'login', limit: 1, ttlMs: 60_000 };
        }
        return undefined;
      }),
    } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector);
    const ctx = context();

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    try {
      guard.canActivate(ctx);
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });
});
