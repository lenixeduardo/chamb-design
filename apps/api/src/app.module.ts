import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { PrismaService } from './common/prisma.service';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { AiModule } from './ai/ai.module';
import { ExportModule } from './export/export.module';

/**
 * Health endpoint.
 *
 * Reports database reachability separately from process liveness — the API
 * intentionally starts without a database, so "up" and "fully functional" are
 * genuinely different states and a load balancer should be able to tell them
 * apart.
 */
@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      database: this.prisma.isConnected ? 'connected' : 'unavailable',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AuthModule,
    ProjectsModule,
    AiModule,
    ExportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
