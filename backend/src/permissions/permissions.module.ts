import { Module } from '@nestjs/common';
import { CaslAbilityFactory } from './casl-ability.factory';
import { PermissionsGuard } from './permissions.guard';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  controllers: [RolesController],
  providers: [CaslAbilityFactory, PermissionsGuard, RolesService],
  exports: [CaslAbilityFactory, PermissionsGuard],
})
export class PermissionsModule {}
