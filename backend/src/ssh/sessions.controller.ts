import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { SessionsService } from './sessions.service';
import { SshManagerService } from './ssh-manager.service';

@ApiTags('ssh')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ssh/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly manager: SshManagerService
  ) {}

  @Get()
  @CheckAbility('read', 'SshHost')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.sessions.list(user.id);
  }

  // Fecha pela REST também (não só pelo evento `session:close` do gateway) — útil pra "encerrar"
  // uma sessão detached sem precisar reconectar o socket só pra isso.
  @Delete(':id')
  @CheckAbility('delete', 'SshHost')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.sessions.findOwned(id, user.id);
    this.manager.destroy(id);
    await this.sessions.close(id);
    return { ok: true };
  }
}
