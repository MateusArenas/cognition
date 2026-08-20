import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from './check-ability.decorator';
import { AddPermissionDto, CreateRoleDto } from './dto/role.dto';
import { PermissionsGuard } from './permissions.guard';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @CheckAbility('read', 'Role')
  list() {
    return this.roles.list();
  }

  @Post()
  @CheckAbility('create', 'Role')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Post(':id/permissions')
  @CheckAbility('update', 'Role')
  addPermission(@Param('id') id: string, @Body() dto: AddPermissionDto) {
    return this.roles.addPermission(id, dto);
  }

  @Delete('permissions/:permissionId')
  @CheckAbility('update', 'Role')
  removePermission(@Param('permissionId') permissionId: string) {
    return this.roles.removePermission(permissionId);
  }
}
