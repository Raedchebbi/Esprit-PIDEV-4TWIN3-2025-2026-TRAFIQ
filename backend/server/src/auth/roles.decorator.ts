// ── TRAFIQ — RBAC Roles Decorator ─────────────────────────────────────────────
import { SetMetadata } from '@nestjs/common';
import { UserRole } from './user.interface';

export const ROLES_KEY = 'roles';

/**
 * Restrict an endpoint to specific roles.
 *
 * Usage:
 *   @Roles('SUPER_ADMIN')           — only super admins
 *   @Roles('ADMIN', 'SUPER_ADMIN')  — any authenticated admin
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
