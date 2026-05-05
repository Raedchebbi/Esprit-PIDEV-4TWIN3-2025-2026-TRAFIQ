import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: RedisClientType;

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<string>('USE_REDIS') === 'true';
  }

  async getClient(): Promise<RedisClientType | null> {
    if (!this.isEnabled()) return null;
    if (this.client?.isOpen) return this.client;

    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<string>('REDIS_PORT', '6379');
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const url = `redis://${host}:${port}`;

    this.client = createClient({
      url,
      password: password || undefined,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
      },
    });
    this.client.on('error', (error: Error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });
    try {
      await this.client.connect();
      return this.client;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis unavailable, using local fallback: ${message}`);
      this.client = undefined;
      return null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }
}
