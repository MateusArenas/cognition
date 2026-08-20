import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { ConnectionsModule } from '../connections/connections.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { MutationsController } from './mutations.controller';
import { MutationsService } from './mutations.service';

@Module({
  imports: [ConnectionsModule, CatalogModule, PermissionsModule],
  controllers: [MutationsController],
  providers: [MutationsService],
})
export class MutationsModule {}
