import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicApi } from './publicApi';

describe('publicApi navigation session token support', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends sessionToken with position updates', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await publicApi.updatePosition(
      'session-1',
      36.8,
      10.1,
      90,
      12,
      4,
      'token-1',
    );

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      sessionToken: 'token-1',
      lat: 36.8,
      lng: 10.1,
    });
  });

  it('sends sessionToken when ending navigation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await publicApi.endNavigation('session-1', 'token-1');

    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      sessionToken: 'token-1',
    });
  });
});
