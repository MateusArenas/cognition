import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { CatalogController } from './catalog.controller';
import { DialectRegistry } from './dialects/dialect.registry';
import { FiltersService } from './filters.service';
import { IntrospectService } from './introspect.service';

@Module({
  imports: [ConnectionsModule, PermissionsModule],
  controllers: [CatalogController],
  providers: [DialectRegistry, FiltersService, IntrospectService],
  exports: [DialectRegistry, FiltersService, IntrospectService],
})
export class CatalogModule {}
