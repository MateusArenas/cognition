import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { MermaidService } from './mermaid.service';

@ApiTags('erd')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@CheckAbility('read', 'Connection')
@Controller('connections/:id')
export class ErdController {
  constructor(private readonly mermaid: MermaidService) {}

  @Get('erd')
  async wholeSchema(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('columns') columns?: string,
    @Query('keysOnly') keysOnly?: string
  ) {
    const mermaid = await this.mermaid.wholeSchema(id, user.id, { columns: columns !== 'false', keysOnly: keysOnly === 'true' });
    return { mermaid };
  }

  @Get('tables/:table/erd')
  async neighborhood(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('table') table: string,
    @Query('depth') depth?: string,
    @Query('columns') columns?: string,
    @Query('keysOnly') keysOnly?: string
  ) {
    const mermaid = await this.mermaid.neighborhood(id, user.id, table, depth ? Number(depth) : 1, {
      columns: columns !== 'false',
      keysOnly: keysOnly === 'true',
    });
    return { mermaid };
  }
}
