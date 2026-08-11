import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

interface JwtPayload {
  sub: string;
  email: string;
}

/**
 * Requires a valid `Authorization: Bearer <token>` on every route it guards.
 *
 * Attaches `{ id, email }` to `req.user` so downstream handlers read identity
 * from the verified token rather than a caller-supplied header.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    if (!token) throw new UnauthorizedException('missing bearer token');

    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      (request as Request & { user: { id: string; email: string } }).user = {
        id: payload.sub,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException('invalid or expired token');
    }
  }
}
