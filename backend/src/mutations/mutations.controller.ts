import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ReadOnlyGuard } from '../common/guards/read-only.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { MutationsDto } from './dto/mutation.dto';
import { MutationsService } from './mutations.service';

@ApiTags('mutations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@CheckAbility('update', 'Connection')
@Controller('connections/:id/tables/:table/mutations')
export class MutationsController {
  constructor(private readonly mutations: MutationsService) {}

  // Sem ReadOnlyGuard aqui de propósito: não escreve nada, só mostra o SQL equivalente — dá
  // pra testar à vontade mesmo numa conexão marcada como somente leitura.
  @Post('preview')
  preview(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Param('table') table: string, @Body() dto: MutationsDto) {
    return this.mutations.preview(id, user.id, table, dto);
  }

  @Post()
  @UseGuards(ReadOnlyGuard)
  apply(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Param('table') table: string, @Body() dto: MutationsDto) {
    return this.mutations.apply(id, user.id, table, dto);
  }
}
