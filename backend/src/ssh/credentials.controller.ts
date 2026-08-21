import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { CredentialsService } from './credentials.service';
import { GenerateCredentialDto, ImportCredentialDto, UpdateCredentialDto } from './dto/credential.dto';

@ApiTags('ssh')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ssh/credentials')
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  @CheckAbility('read', 'SshHost')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.credentials.list(user.id);
  }

  @Post()
  @CheckAbility('create', 'SshHost')
  import(@CurrentUser() user: CurrentUserPayload, @Body() dto: ImportCredentialDto) {
    return this.credentials.import(user.id, dto);
  }

  @Post('generate')
  @CheckAbility('create', 'SshHost')
  generate(@CurrentUser() user: CurrentUserPayload, @Body() dto: GenerateCredentialDto) {
    return this.credentials.generate(user.id, dto);
  }

  @Patch(':id')
  @CheckAbility('update', 'SshHost')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateCredentialDto) {
    return this.credentials.update(id, user.id, dto);
  }

  @Delete(':id')
  @CheckAbility('delete', 'SshHost')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.credentials.remove(id, user.id);
    return { ok: true };
  }
}
