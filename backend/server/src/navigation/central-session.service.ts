import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { RedisService } from '../redis/redis.service';
import { UserSessionService } from '../mongodb/user-session.service';
import {
  NavigationSession,
  StartNavigationDto,
  UpdatePositionDto,
} from './navigation-session.interface';

export interface CentralSessionRecord extends NavigationSession {
  token: string;
  userId?: string;
  country?: string;
  endedAt?: string;
}

@Injectable()
export class CentralSessionService {
  private readonly logger = new Logger(CentralSessionService.name);
  private readonly memory = new Map<string, CentralSessionRecord>();
  private readonly ttlSeconds = 2 * 60 * 60;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly userSessionService: UserSessionService,
  ) {}

  useCentralStore(): boolean {
    return this.configService.get<string>('USE_CENTRAL_SESSIONS') === 'true';
  }

  async createSession(
    dto: StartNavigationDto,
    userId?: string,
    country?: string,
  ): Promise<{ sessionId: string; sessionToken: string }> {
    const sessionId = `nav_${crypto.randomUUID()}`;
    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const session: CentralSessionRecord = {
      sessionId,
      token,
      userId,
      country,
      routeId: dto.routeId,
      routeCoords: dto.routeCoords,
      origin: dto.origin,
      destination: dto.destination,
      currentPosition: { lat: dto.origin.lat, lng: dto.origin.lng },
      createdAt: now,
      lastUpdate: now,
    };

    await this.save(session);
    this.userSessionService.trackSessionStarted({
      sessionId,
      userId,
      country,
      lat: dto.origin.lat,
      lng: dto.origin.lng,
      route: {
        routeId: dto.routeId,
        routeCoords: dto.routeCoords,
        origin: dto.origin,
        destination: dto.destination,
      },
      metadata: { central: true },
    });
    return { sessionId, sessionToken: token };
  }

  async getSession(
    sessionId: string,
  ): Promise<CentralSessionRecord | undefined> {
    const redis = await this.redisService.getClient();
    if (redis) {
      const raw = await redis.get(this.key(sessionId));
      return raw ? this.deserialize(raw) : undefined;
    }
    return this.memory.get(sessionId);
  }

  async updatePosition(
    sessionId: string,
    dto: UpdatePositionDto,
    token?: string,
  ): Promise<CentralSessionRecord> {
    const session = await this.requireSession(sessionId, token);
    session.currentPosition = {
      lat: dto.lat,
      lng: dto.lng,
      heading: dto.heading,
      speed: dto.speed,
      accuracy: dto.accuracy,
    };
    session.lastUpdate = new Date();
    await this.save(session);
    this.userSessionService.trackPositionUpdated({
      sessionId,
      userId: session.userId,
      country: session.country,
      lat: dto.lat,
      lng: dto.lng,
      route: {
        routeId: session.routeId,
        routeCoords: session.routeCoords,
        origin: session.origin,
        destination: session.destination,
      },
      metadata: { central: true, heading: dto.heading, speed: dto.speed },
    });
    return session;
  }

  async endSession(sessionId: string, token?: string): Promise<void> {
    await this.requireSession(sessionId, token);
    const redis = await this.redisService.getClient();
    if (redis) await redis.del(this.key(sessionId));
    else this.memory.delete(sessionId);
    this.userSessionService.trackSessionEnded(sessionId);
  }

  async validateSession(sessionId: string, token?: string): Promise<boolean> {
    try {
      await this.requireSession(sessionId, token);
      return true;
    } catch {
      return false;
    }
  }

  private async requireSession(
    sessionId: string,
    token?: string,
  ): Promise<CentralSessionRecord> {
    const session = await this.getSession(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (!token || session.token !== token) {
      throw new UnauthorizedException('Invalid navigation session token');
    }
    return session;
  }

  private async save(session: CentralSessionRecord): Promise<void> {
    const redis = await this.redisService.getClient();
    if (redis) {
      await redis.set(this.key(session.sessionId), this.serialize(session), {
        EX: this.ttlSeconds,
      });
      return;
    }
    this.memory.set(session.sessionId, session);
  }

  private key(sessionId: string): string {
    return `trafiq:navigation-session:${sessionId}`;
  }

  private serialize(session: CentralSessionRecord): string {
    return JSON.stringify(session);
  }

  private deserialize(raw: string): CentralSessionRecord {
    const parsed = JSON.parse(raw) as Omit<
      CentralSessionRecord,
      'createdAt' | 'lastUpdate'
    > & { createdAt: string; lastUpdate: string };
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      lastUpdate: new Date(parsed.lastUpdate),
    };
  }
}
