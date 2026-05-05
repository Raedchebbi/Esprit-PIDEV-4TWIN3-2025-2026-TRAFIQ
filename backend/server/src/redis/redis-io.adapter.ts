import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions } from 'socket.io';
import type { INestApplicationContext } from '@nestjs/common';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    if (this.configService.get<string>('USE_REDIS') !== 'true') {
      this.logger.log(
        'Socket.IO Redis adapter disabled: USE_REDIS is not true',
      );
      return;
    }

    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<string>('REDIS_PORT', '6379');
    const password = this.configService.get<string>('REDIS_PASSWORD');
    const url = `redis://${host}:${port}`;

    const pubClient = createClient({ url, password: password || undefined });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (error: Error) =>
      this.logger.warn(`Redis pub client error: ${error.message}`),
    );
    subClient.on('error', (error: Error) =>
      this.logger.warn(`Redis sub client error: ${error.message}`),
    );

    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Socket.IO Redis adapter connected');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Socket.IO Redis adapter unavailable, using local adapter: ${message}`,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
