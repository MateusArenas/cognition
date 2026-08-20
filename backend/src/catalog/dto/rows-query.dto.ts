import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'in' | 'between' | 'isNull' | 'notNull';

export interface FilterInput {
  column: string;
  op: FilterOp;
  value?: unknown;
}

// Query string de GET .../tables/:table/rows — DB-MOBILE.md §2.4/§3.2. `filters` chega como
// JSON serializado (é o formato mais simples de passar um array por query string); a
// desserialização/validação de forma acontece em FiltersService, não aqui.
export class RowsQueryDto {
  @ApiProperty({ required: false, description: 'Colunas projetadas, separadas por vírgula. Vazio = todas.' })
  @IsOptional()
  @IsString()
  columns?: string;

  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  orderBy?: string;

  @ApiProperty({ required: false, enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @ApiProperty({ required: false, description: 'JSON de FilterInput[]' })
  @IsOptional()
  @IsString()
  filters?: string;

  @ApiProperty({ required: false, description: 'Termo de busca rápida (debounce de 350ms no app)' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({ required: false, enum: ['tudo', 'texto'], default: 'tudo' })
  @IsOptional()
  @IsIn(['tudo', 'texto'])
  qMode?: 'tudo' | 'texto';
}
