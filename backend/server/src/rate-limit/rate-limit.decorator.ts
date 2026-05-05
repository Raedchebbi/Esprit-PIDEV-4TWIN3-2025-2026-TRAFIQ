import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'trafiq:rate-limit';

export interface RateLimitOptions {
  key: string;
  limit: number;
  ttlMs: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
