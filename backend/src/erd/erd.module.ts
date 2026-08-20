import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ErdController } from './erd.controller';
import { MermaidService } from './mermaid.service';

@Module({
  imports: [CatalogModule, PermissionsModule],
  controllers: [ErdController],
  providers: [MermaidService],
})
export class ErdModule {}
