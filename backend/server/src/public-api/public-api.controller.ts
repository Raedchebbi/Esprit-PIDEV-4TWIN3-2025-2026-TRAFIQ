// ── TRAFIQ — Public API Controller ────────────────────────────────────────────
// Unauthenticated REST endpoints for the citizen (public) app.
// No JWT guard — these are open to all users.

import { Controller, Get, Post, Body } from '@nestjs/common';
import { PublicApiService } from './public-api.service';
import { SuggestRoutesDto } from '../navigation/navigation-session.interface';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

@Controller('public')
export class PublicApiController {
  constructor(private readonly publicApiService: PublicApiService) {}

  /**
   * GET /public/incidents
   * Returns active incidents enriched with camera GPS coordinates.
   */
  @Get('incidents')
  async getPublicIncidents() {
    return this.publicApiService.getPublicIncidents();
  }

  /**
   * GET /public/congestion
   * Returns per-zone congestion data from live vehicle counts.
   */
  @Get('congestion')
  async getCongestionData() {
    return this.publicApiService.getCongestionData();
  }

  /**
   * POST /public/routes/suggest
   * AI-scored route suggestions based on origin/destination.
   * Body: { originLat, originLng, destLat, destLng }
   */
  @Post('routes/suggest')
  @RateLimit({
    key: 'public-route-suggest',
    limit: Number(process.env.RATE_LIMIT_PUBLIC_ROUTE_LIMIT ?? 60),
    ttlMs: Number(process.env.RATE_LIMIT_PUBLIC_ROUTE_TTL_MS ?? 60_000),
  })
  async suggestRoutes(@Body() dto: SuggestRoutesDto) {
    return this.publicApiService.suggestRoutes(dto);
  }
}
