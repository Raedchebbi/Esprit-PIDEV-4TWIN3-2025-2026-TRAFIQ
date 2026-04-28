import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

type RequestRoute = {
  path?: string;
};

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    if (req.path === '/metrics') {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const endedAt = process.hrtime.bigint();
      const durationSeconds = Number(endedAt - startedAt) / 1_000_000_000;
      const currentRoute = req.route as RequestRoute | undefined;
      const routePath =
        typeof currentRoute?.path === 'string' ? currentRoute.path : undefined;
      const route =
        routePath && req.baseUrl
          ? `${req.baseUrl}${routePath}`
          : routePath || req.baseUrl || req.path;

      this.metricsService.observeRequest(
        req.method,
        route || 'unknown',
        res.statusCode,
        durationSeconds,
      );
    });

    next();
  }
}
