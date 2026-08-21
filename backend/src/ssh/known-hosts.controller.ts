import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { KnownHostsService } from './known-hosts.service';

@ApiTags('ssh')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ssh/known-hosts')
export class KnownHostsController {
  constructor(private readonly knownHosts: KnownHostsService) {}

  @Get()
  @CheckAbility('read', 'SshHost')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.knownHosts.list(user.id);
  }

  // "Esquecer" a chave — próxima conexão volta a passar pelo alerta de TOFU.
  @Delete(':id')
  @CheckAbility('delete', 'SshHost')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.knownHosts.remove(id, user.id);
    return { ok: true };
  }
}
