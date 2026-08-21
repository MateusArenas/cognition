import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { CredentialsService } from './credentials.service';
import { CreateHostDto, UpdateHostDto } from './dto/host.dto';
import { HostsService } from './hosts.service';
import { SshManagerService } from './ssh-manager.service';

@ApiTags('ssh')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ssh/hosts')
export class HostsController {
  constructor(
    private readonly hosts: HostsService,
    private readonly credentials: CredentialsService,
    private readonly manager: SshManagerService
  ) {}

  @Get()
  @CheckAbility('read', 'SshHost')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.hosts.list(user.id);
  }

  @Post()
  @CheckAbility('create', 'SshHost')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateHostDto) {
    return this.hosts.create(user.id, dto);
  }

  @Get(':id')
  @CheckAbility('read', 'SshHost')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.hosts.findOne(id, user.id);
  }

  @Patch(':id')
  @CheckAbility('update', 'SshHost')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateHostDto) {
    return this.hosts.update(id, user.id, dto);
  }

  @Delete(':id')
  @CheckAbility('delete', 'SshHost')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.hosts.remove(id, user.id);
    return { ok: true };
  }

  // Sondagem de TCP+autenticação sem abrir shell nem registrar sessão — mesmo espírito do
  // POST /connections/test do cliente de banco.
  @Post(':id/test')
  @CheckAbility('read', 'SshHost')
  async test(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    const host = await this.hosts.findOwned(id, user.id);
    if (!host.credentialId) throw new BadRequestException({ message: 'Host sem credencial configurada.', code: 'SSH_HOST_NO_CREDENTIAL' });
    const secret = await this.credentials.decryptedSecret(host.credentialId, user.id);
    return this.manager.testConnection(host, secret);
  }
}
