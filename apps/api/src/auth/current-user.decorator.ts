import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The authenticated user's id, set by `JwtAuthGuard`. Only valid on routes
 * behind that guard — anywhere else `req.user` is undefined.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: { id: string } }>();
  return request.user!.id;
});
