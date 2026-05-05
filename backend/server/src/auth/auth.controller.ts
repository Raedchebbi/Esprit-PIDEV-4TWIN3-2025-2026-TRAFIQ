// ── TRAFIQ — Auth Controller ──────────────────────────────────────────────────
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { CreateAdminDto, UpdateAdminDto, RequestUser } from './user.interface';
import { RateLimit } from '../rate-limit/rate-limit.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  /** POST /auth/login — Authenticate and receive JWT + user profile. */
  @Post('login')
  @RateLimit({
    key: 'auth-login',
    limit: Number(process.env.RATE_LIMIT_LOGIN_LIMIT ?? 5),
    ttlMs: Number(process.env.RATE_LIMIT_LOGIN_TTL_MS ?? 60_000),
  })
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  // ── Authenticated ───────────────────────────────────────────────────────────

  /** GET /auth/me — Return current user from JWT token. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req: { user: RequestUser }) {
    return req.user;
  }

  // ── SUPER_ADMIN only ────────────────────────────────────────────────────────

  /** GET /auth/admins — List all admin users. */
  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  listAdmins() {
    return this.authService.listAdmins();
  }

  /** POST /auth/admins — Create a new ADMIN user with country assignment. */
  @Post('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  createAdmin(
    @Body() dto: CreateAdminDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.authService.createAdmin(dto, req.user.id);
  }

  /** PATCH /auth/admins/:id — Update an ADMIN's name, country, or password. */
  @Patch('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    return this.authService.updateAdmin(id, dto);
  }

  /** DELETE /auth/admins/:id — Delete an ADMIN user. */
  @Delete('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  async deleteAdmin(@Param('id') id: string) {
    return this.authService.deleteAdmin(id);
  }
}
