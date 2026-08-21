import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { CreateSnippetDto, UpdateSnippetDto } from './dto/snippet.dto';
import { SnippetsService } from './snippets.service';

@ApiTags('ssh')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ssh/snippets')
export class SnippetsController {
  constructor(private readonly snippets: SnippetsService) {}

  @Get()
  @CheckAbility('read', 'SshHost')
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.snippets.list(user.id);
  }

  @Post()
  @CheckAbility('create', 'SshHost')
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateSnippetDto) {
    return this.snippets.create(user.id, dto);
  }

  @Patch(':id')
  @CheckAbility('update', 'SshHost')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateSnippetDto) {
    return this.snippets.update(id, user.id, dto);
  }

  @Delete(':id')
  @CheckAbility('delete', 'SshHost')
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    await this.snippets.remove(id, user.id);
    return { ok: true };
  }
}
