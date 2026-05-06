// ── TRAFIQ — Auth Service ─────────────────────────────────────────────────────
// Manages user records (JSON file), password hashing, and JWT issuance.
// Seeds a default SUPER_ADMIN on first start if no users exist.

import {
  Injectable,
  Logger,
  OnModuleInit,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { MongoPrimaryRepository } from '../mongodb/mongo-primary.repository';
import {
  User,
  JwtPayload,
  CreateAdminDto,
  UpdateAdminDto,
} from './user.interface';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private readonly usersFile = path.resolve(
    process.cwd(),
    'data',
    'users.json',
  );
  private users: User[] = [];

  constructor(
    private readonly jwtService: JwtService,
    private readonly mongoPrimary: MongoPrimaryRepository,
  ) {}

  async onModuleInit() {
    await this.loadUsers();

    if (this.users.length === 0) {
      await this.seedInitialUsers();
    }
  }

  private async seedInitialUsers(): Promise<void> {
    const initialEmail = process.env.INITIAL_SUPER_ADMIN_EMAIL;
    const initialPassword = process.env.INITIAL_SUPER_ADMIN_PASSWORD;
    const initialName = process.env.INITIAL_SUPER_ADMIN_NAME ?? 'Super Admin';

    if (initialEmail && initialPassword) {
      const hashed = await bcrypt.hash(initialPassword, SALT_ROUNDS);
      const superAdmin: User = {
        id: this.generateId(),
        email: initialEmail,
        name: initialName,
        password: hashed,
        role: 'SUPER_ADMIN',
        createdAt: new Date().toISOString(),
      };
      this.users = [superAdmin];
      await this.saveUsers();
      this.logger.log(
        `Seeded initial SUPER_ADMIN from environment: ${initialEmail}`,
      );
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'No users found and INITIAL_SUPER_ADMIN_EMAIL/INITIAL_SUPER_ADMIN_PASSWORD are not set. Skipping production seeding.',
      );
      return;
    }

    if (process.env.SEED_DEMO_USERS === 'false') {
      this.logger.warn(
        'No users found and SEED_DEMO_USERS=false. Skipping demo seeding.',
      );
      return;
    }

    this.logger.warn(
      'No users found — seeding local demo users for non-production only.',
    );
    const hashed = await bcrypt.hash('SuperAdmin2025!', SALT_ROUNDS);
    const superAdmin: User = {
      id: this.generateId(),
      email: 'super@trafiq.ai',
      name: 'Super Admin',
      password: hashed,
      role: 'SUPER_ADMIN',
      createdAt: new Date().toISOString(),
    };

    const adminHash = await bcrypt.hash('trafiq2025', SALT_ROUNDS);
    const demoAdmin: User = {
      id: this.generateId(),
      email: 'admin@trafiq.ai',
      name: 'Admin TRAFIQ',
      password: adminHash,
      role: 'ADMIN',
      country: 'France',
      createdAt: new Date().toISOString(),
      createdBy: superAdmin.id,
    };

    const astrakhanAdmin: User = {
      id: this.generateId(),
      email: 'astrakhan@trafiq.ai',
      name: 'Astrakhan Admin',
      password: adminHash,
      role: 'ADMIN',
      country: 'Astrakhan',
      createdAt: new Date().toISOString(),
      createdBy: superAdmin.id,
    };

    const spainAdmin: User = {
      id: this.generateId(),
      email: 'spain@trafiq.ai',
      name: 'Spain Admin',
      password: adminHash,
      role: 'ADMIN',
      country: 'Spain',
      createdAt: new Date().toISOString(),
      createdBy: superAdmin.id,
    };

    this.users = [superAdmin, demoAdmin, astrakhanAdmin, spainAdmin];
    await this.saveUsers();
  }

  // ── Authentication ──────────────────────────────────────────────────────────

  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = this.users.find(
      (u) => u.email.toLowerCase() === email.toLowerCase(),
    );
    if (!user) return null;

    const match = await bcrypt.compare(password, user.password);
    if (!match) return null;

    return this.stripPassword(user);
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      country: user.country,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        country: user.country,
        avatar: user.name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .toUpperCase()
          .slice(0, 2),
      },
    };
  }

  // ── Admin CRUD (SUPER_ADMIN only) ───────────────────────────────────────────

  async createAdmin(
    dto: CreateAdminDto,
    createdById: string,
  ): Promise<Omit<User, 'password'>> {
    if (!dto.email || !dto.name || !dto.password || !dto.country) {
      throw new BadRequestException(
        'email, name, password, and country are required',
      );
    }

    const existing = this.users.find(
      (u) => u.email.toLowerCase() === dto.email.toLowerCase(),
    );
    if (existing) {
      throw new ConflictException(
        `User with email ${dto.email} already exists`,
      );
    }

    const hashed = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const newUser: User = {
      id: this.generateId(),
      email: dto.email,
      name: dto.name,
      password: hashed,
      role: 'ADMIN',
      country: dto.country,
      createdAt: new Date().toISOString(),
      createdBy: createdById,
    };

    this.users.push(newUser);
    await this.saveUsers();
    this.logger.log(`Created ADMIN: ${newUser.email} → ${newUser.country}`);

    return this.stripPassword(newUser);
  }

  listAdmins(): Omit<User, 'password'>[] {
    return this.users.map((user) => this.stripPassword(user));
  }

  async updateAdmin(
    id: string,
    dto: UpdateAdminDto,
  ): Promise<Omit<User, 'password'>> {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new NotFoundException(`Admin ${id} not found`);

    if (user.role === 'SUPER_ADMIN') {
      throw new BadRequestException(
        'Cannot modify SUPER_ADMIN via this endpoint',
      );
    }

    if (dto.name) user.name = dto.name;
    if (dto.country) user.country = dto.country;
    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    }

    await this.saveUsers();
    this.logger.log(`Updated ADMIN: ${user.email}`);

    return this.stripPassword(user);
  }

  async deleteAdmin(id: string): Promise<{ deleted: boolean }> {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new NotFoundException(`Admin ${id} not found`);

    if (user.role === 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot delete SUPER_ADMIN');
    }

    this.users = this.users.filter((u) => u.id !== id);
    await this.saveUsers();
    this.logger.log(`Deleted ADMIN: ${user.email}`);
    return { deleted: true };
  }

  // ── File I/O ────────────────────────────────────────────────────────────────

  private async loadUsers(): Promise<void> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      try {
        this.users = await this.mongoPrimary.findUsers();
        if (this.users.length > 0) {
          this.logger.log(`Loaded ${this.users.length} user(s) from MongoDB`);
          return;
        }
        if (process.env.NODE_ENV === 'production') {
          this.logger.warn(
            'MongoDB users collection is empty in production. Skipping JSON user fallback.',
          );
          return;
        }
      } catch (error) {
        this.logger.warn(
          `Mongo users read failed, using JSON: ${this.errorMessage(error)}`,
        );
      }
    }

    try {
      const dir = path.dirname(this.usersFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (!fs.existsSync(this.usersFile)) {
        this.users = [];
        return;
      }
      const raw = fs.readFileSync(this.usersFile, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      this.users = Array.isArray(parsed) ? (parsed as User[]) : [];
      this.logger.log(
        `Loaded ${this.users.length} user(s) from ${this.usersFile}`,
      );
    } catch (err) {
      this.logger.error(`Failed to load users: ${err}`);
      this.users = [];
    }
  }

  private async saveUsers(): Promise<void> {
    if (this.mongoPrimary.isPrimaryEnabled()) {
      try {
        await Promise.all(
          this.users.map((user) => this.mongoPrimary.upsertUser(user)),
        );
        return;
      } catch (error) {
        this.logger.warn(
          `Mongo users write failed, using JSON: ${this.errorMessage(error)}`,
        );
      }
    }

    try {
      const dir = path.dirname(this.usersFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.usersFile,
        JSON.stringify(this.users, null, 2),
        'utf-8',
      );
    } catch (err) {
      this.logger.error(`Failed to save users: ${err}`);
    }
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private stripPassword(user: User): Omit<User, 'password'> {
    const { password, ...rest } = user;
    void password;
    return rest;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
