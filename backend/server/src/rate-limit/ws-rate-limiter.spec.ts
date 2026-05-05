import { WsRateLimiter } from './ws-rate-limiter';

describe('WsRateLimiter', () => {
  it('rejects events after the configured threshold', () => {
    const limiter = new WsRateLimiter();

    expect(
      limiter.allow({
        key: 'update_position',
        clientId: 'socket-1',
        limit: 1,
        ttlMs: 60_000,
      }),
    ).toBe(true);
    expect(
      limiter.allow({
        key: 'update_position',
        clientId: 'socket-1',
        limit: 1,
        ttlMs: 60_000,
      }),
    ).toBe(false);
  });
});
