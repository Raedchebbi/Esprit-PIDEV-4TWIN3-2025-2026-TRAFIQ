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

  constructor(private readonly jwtService: JwtService) {}

  async onModuleInit() {
    this.loadUsers();

    // Seed default SUPER_ADMIN if no users exist
    if (this.users.length === 0) {
      this.logger.log('No users found — seeding default SUPER_ADMIN...');
      const hashed = await bcrypt.hash('SuperAdmin2025!', SALT_ROUNDS);
      const superAdmin: User = {
        id: this.generateId(),
        email: 'super@trafiq.ai',
        name: 'Super Admin',
        password: hashed,
        role: 'SUPER_ADMIN',
        createdAt: new Date().toISOString(),
      };

      // Also seed a demo ADMIN for France (backward compat with the old hardcoded cred)
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

      this.users = [superAdmin, demoAdmin];
      this.saveUsers();
      this.logger.log(
        `Seeded SUPER_ADMIN (super@trafiq.ai) and demo ADMIN (admin@trafiq.ai → France)`,
      );
    }
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
    this.saveUsers();
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

    this.saveUsers();
    this.logger.log(`Updated ADMIN: ${user.email}`);

    return this.stripPassword(user);
  }

  deleteAdmin(id: string): { deleted: boolean } {
    const user = this.users.find((u) => u.id === id);
    if (!user) throw new NotFoundException(`Admin ${id} not found`);

    if (user.role === 'SUPER_ADMIN') {
      throw new BadRequestException('Cannot delete SUPER_ADMIN');
    }

    this.users = this.users.filter((u) => u.id !== id);
    this.saveUsers();
    this.logger.log(`Deleted ADMIN: ${user.email}`);
    return { deleted: true };
  }

  // ── File I/O ────────────────────────────────────────────────────────────────

  private loadUsers(): void {
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

  private saveUsers(): void {
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
}
