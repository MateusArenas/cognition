import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CheckAbility } from '../permissions/check-ability.decorator';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { QueryDto } from './dto/query.dto';
import { RowsQueryDto } from './dto/rows-query.dto';
import { IntrospectService } from './introspect.service';

// Rotas de leitura de catálogo — nenhuma delas conhece dialeto (isso é IntrospectService +
// DialectRegistry). DB-MOBILE.md §3.1.
@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@CheckAbility('read', 'Connection')
@Controller('connections/:id')
export class CatalogController {
  constructor(private readonly introspect: IntrospectService) {}

  @Get('databases')
  databases(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.introspect.databases(id, user.id);
  }

  @Get('schemas')
  schemas(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.introspect.schemas(id, user.id);
  }

  @Get('tables')
  tables(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Query('schema') schema?: string) {
    return this.introspect.tables(id, user.id, schema);
  }

  @Get('tables/:table')
  tableDetail(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Param('table') table: string, @Query('schema') schema?: string) {
    return this.introspect.tableDetail(id, user.id, table, schema);
  }

  @Get('tables/:table/ddl')
  ddl(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Param('table') table: string, @Query('schema') schema?: string) {
    return this.introspect.ddl(id, user.id, table, schema).then((sql) => ({ sql }));
  }

  @Get('tables/:table/count')
  count(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Param('table') table: string, @Query('schema') schema?: string) {
    return this.introspect.count(id, user.id, table, schema).then((count) => ({ count }));
  }

  @Get('tables/:table/rows')
  rows(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Param('table') table: string,
    @Query() query: RowsQueryDto,
    @Query('schema') schema?: string
  ) {
    return this.introspect.rows(id, user.id, table, query, schema);
  }

  @Post('tables/:table/rows/cancel')
  cancel(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.introspect.cancel(id, user.id);
  }

  // Console SQL livre — Etapa DB2, ver introspect.service.ts#rawQuery e sql-safety.ts.
  // `allowWrite` só existe pro toggle da aba Consulta — sem ele (default), continua só leitura.
  @Post('query')
  query(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: QueryDto) {
    return this.introspect.rawQuery(id, user.id, dto.sql, dto.allowWrite ?? false);
  }
}
