import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('records request counters and durations in the Prometheus registry', async () => {
    service.observeRequest('GET', '/health', 200, 0.12);

    const metrics = await service.getMetrics();

    expect(metrics).toContain('http_requests_total');
    expect(metrics).toContain('route="/health"');
    expect(metrics).toContain('status_code="200"');
    expect(metrics).toContain('http_request_duration_seconds_bucket');
  });

  it('exposes the Prometheus content type for the metrics endpoint', () => {
    expect(service.getContentType()).toContain('text/plain');
  });
});
