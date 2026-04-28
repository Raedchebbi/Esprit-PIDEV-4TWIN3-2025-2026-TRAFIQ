// ── TRAFIQ — JWT Auth Guard ────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Standard NestJS guard that delegates to the 'jwt' Passport strategy.
 * Apply to routes/controllers with @UseGuards(JwtAuthGuard).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
