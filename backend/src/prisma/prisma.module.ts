import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global: toda a árvore de módulos (users, connections, permissions...) injeta PrismaService
// sem cada um precisar importar PrismaModule de novo.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
