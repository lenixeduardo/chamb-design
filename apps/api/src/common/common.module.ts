import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { CacheService } from './cache.service';
import { RegistryService } from './registry.provider';

/**
 * Infrastructure shared by every feature module.
 *
 * Global because all three are process-wide singletons with lifecycles tied to
 * the app, not to a request — threading them through imports would be noise.
 */
@Global()
@Module({
  providers: [PrismaService, CacheService, RegistryService],
  exports: [PrismaService, CacheService, RegistryService],
})
export class CommonModule {}
