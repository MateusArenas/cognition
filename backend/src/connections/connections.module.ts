import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { DriversService } from './drivers.service';
import { KnexPoolService } from './knex-pool.service';

@Module({
  imports: [PermissionsModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, KnexPoolService, DriversService],
  exports: [ConnectionsService, KnexPoolService],
})
export class ConnectionsModule {}
