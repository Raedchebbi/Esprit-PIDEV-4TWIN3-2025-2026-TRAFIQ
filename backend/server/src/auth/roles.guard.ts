// ── TRAFIQ — RBAC Roles Guard ─────────────────────────────────────────────────
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { UserRole, RequestUser } from './user.interface';

/**
 * Guard that checks whether the authenticated user has one of the
 * roles specified by the @Roles() decorator.
 *
 * Must be used AFTER JwtAuthGuard (so request.user is populated).
 *
 * If no @Roles() decorator is present, the route is allowed
 * (authentication-only, any role).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator → any authenticated user is allowed
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = request.user;

    if (!user) return false;

    return requiredRoles.includes(user.role);
  }
}
