import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Collection,
  Db,
  Document,
  MongoClient,
  MongoClientOptions,
} from 'mongodb';

export interface MongoConnectionStatus {
  enabled: boolean;
  connected: boolean;
  uriConfigured: boolean;
  databaseName?: string;
}

@Injectable()
export class MongoDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoDbService.name);
  private client?: MongoClient;
  private database?: Db;
  private databaseName?: string;
  private enabled = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const uri = this.configService.get<string>('MONGODB_URI')?.trim();
    if (!uri) {
      this.logger.log('MongoDB integration disabled: MONGODB_URI is not set');
      return;
    }

    this.databaseName = this.configService.get<string>(
      'MONGODB_DB_NAME',
      'trafiq',
    );

    const options: MongoClientOptions = {
      maxPoolSize: this.readNumber('MONGODB_MAX_POOL_SIZE', 20),
      minPoolSize: this.readNumber('MONGODB_MIN_POOL_SIZE', 0),
      serverSelectionTimeoutMS: this.readNumber(
        'MONGODB_SERVER_SELECTION_TIMEOUT_MS',
        5000,
      ),
      retryWrites: true,
    };

    try {
      this.client = new MongoClient(uri, options);
      await this.client.connect();
      this.database = this.client.db(this.databaseName);
      await this.database.command({ ping: 1 });
      this.enabled = true;
      this.logger.log(`MongoDB connected to database "${this.databaseName}"`);
    } catch (error) {
      this.enabled = false;
      await this.client?.close().catch(() => undefined);
      this.client = undefined;
      this.database = undefined;

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`MongoDB connection failed: ${message}`);
      if (this.readBoolean('MONGODB_FAIL_FAST', false)) {
        throw error;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  isConnected(): boolean {
    return this.enabled && Boolean(this.database);
  }

  collection<T extends Document>(name: string): Collection<T> | null {
    if (!this.database) {
      return null;
    }
    return this.database.collection<T>(name);
  }

  getStatus(): MongoConnectionStatus {
    return {
      enabled: this.enabled,
      connected: this.isConnected(),
      uriConfigured: Boolean(this.configService.get<string>('MONGODB_URI')),
      databaseName: this.databaseName,
    };
  }

  readTtlSeconds(): number | undefined {
    const days = this.readNumber('MONGODB_TTL_DAYS', 30);
    return days > 0 ? days * 24 * 60 * 60 : undefined;
  }

  private readNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string>(key);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string>(key);
    if (!raw) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }
}
