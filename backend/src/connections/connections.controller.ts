import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto, TestConnectionDto, UpdateConnectionDto } from './dto/connection.dto';
import { DriversService } from './drivers.service';
import { KnexPoolService } from './knex-pool.service';

@ApiTags('connections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly pool: KnexPoolService,
    private readonly drivers: DriversService
  ) {}

  @Get('drivers')
  listDrivers() {
    return this.drivers.list();
  }

  @Get('connections')
  @CheckAbility('read', 'Connection')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.connections.list(user.id);
  }

  @Post('connections')
  @CheckAbility('create', 'Connection')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateConnectionDto) {
    return this.connections.create(user.id, dto);
  }

  @Post('connections/test')
  @CheckAbility('create', 'Connection')
  async test(@Body() dto: TestConnectionDto) {
    return this.pool.probe(dto.client, { connection: dto.config.connection as Record<string, unknown> } as never);
  }

  @Get('connections/:id')
  @CheckAbility('read', 'Connection')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.connections.findOne(id, user.id);
  }

  @Patch('connections/:id')
  @CheckAbility('update', 'Connection')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateConnectionDto) {
    return this.connections.update(id, user.id, dto);
  }

  @Delete('connections/:id')
  @CheckAbility('delete', 'Connection')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.connections.remove(id, user.id);
    return { ok: true };
  }

  @Post('connections/:id/connect')
  @CheckAbility('read', 'Connection')
  async connect(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const c = await this.connections.findOwned(id, user.id);
    const cfg = await this.connections.decryptedConfig(id, user.id);
    const instance = this.pool.getOrCreate(id, c.client, cfg);
    await instance.raw('select 1');
    return { connected: true };
  }

  @Post('connections/:id/disconnect')
  @CheckAbility('read', 'Connection')
  async disconnect(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.connections.findOwned(id, user.id);
    await this.pool.destroy(id);
    return { connected: false };
  }

  @Get('connections/:id/status')
  @CheckAbility('read', 'Connection')
  async status(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.connections.findOwned(id, user.id);
    return this.pool.status(id);
  }
}
