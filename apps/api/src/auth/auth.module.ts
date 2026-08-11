import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const DEV_FALLBACK_SECRET = 'opendesign-dev-only-secret-do-not-use-in-production';

function resolveSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  // Same posture as PrismaService: an optional server should still boot
  // without production config, but it must be impossible to miss that it
  // did.
  new Logger('AuthModule').warn(
    'JWT_SECRET is not set — falling back to a well-known development secret. ' +
      'Set JWT_SECRET before deploying, or every token issued here is forgeable.',
  );
  return DEV_FALLBACK_SECRET;
}

@Module({
  imports: [
    JwtModule.register({
      secret: resolveSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
