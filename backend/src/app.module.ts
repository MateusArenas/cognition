import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ConnectionsModule } from './connections/connections.module';
import { ErdModule } from './erd/erd.module';
import { MutationsModule } from './mutations/mutations.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { SshModule } from './ssh/ssh.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, PermissionsModule, ConnectionsModule, CatalogModule, ErdModule, MutationsModule, SshModule],
})
export class AppModule {}
