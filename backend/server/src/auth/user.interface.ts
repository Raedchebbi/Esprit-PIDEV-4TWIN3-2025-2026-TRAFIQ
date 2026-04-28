// ── TRAFIQ — User Interface ───────────────────────────────────────────────────
// Defines the shape of admin user records stored in data/users.json.

import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  password: string; // bcrypt hash
  role: UserRole;
  country?: string; // Required for ADMIN, null/undefined for SUPER_ADMIN
  createdAt: string; // ISO 8601
  createdBy?: string; // id of the SUPER_ADMIN who created this user
}

/** JWT payload embedded in every token. */
export interface JwtPayload {
  sub: string; // user.id
  email: string;
  role: UserRole;
  country?: string;
}

/** Data attached to request.user after JWT validation. */
export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  country?: string;
}

/** DTO for creating a new admin. */
export class CreateAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  name: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  country: string;
}

/** DTO for updating an existing admin. */
export class UpdateAdminDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
