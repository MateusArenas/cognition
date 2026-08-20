import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export type MutationKind = 'insert' | 'update' | 'delete';

export class MutationChangeDto {
  @ApiProperty({ enum: ['insert', 'update', 'delete'] })
  @IsIn(['insert', 'update', 'delete'])
  kind!: MutationKind;

  @ApiProperty({ required: false, description: 'insert: colunas a inserir' })
  @IsOptional()
  @IsObject()
  values?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'update/delete: chave primária da linha' })
  @IsOptional()
  @IsObject()
  key?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'update: colunas a alterar' })
  @IsOptional()
  @IsObject()
  set?: Record<string, unknown>;

  @ApiProperty({ required: false, description: 'update: valores originais (trava otimista)' })
  @IsOptional()
  @IsObject()
  was?: Record<string, unknown>;
}

// DB-MOBILE.md §4.9: buffer local do app vira UMA transação por chamada. `optimistic` liga a
// trava (WHERE inclui `was` além da PK) — sem isso, "última escrita vence" sem aviso.
export class MutationsDto {
  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  optimistic?: boolean;

  @ApiProperty({ type: [MutationChangeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MutationChangeDto)
  changes!: MutationChangeDto[];
}

export interface MutationChangeResult {
  kind: MutationKind;
  affected: number;
  returned?: Record<string, unknown>;
  sql?: string;
}

export interface MutationsResult {
  ok: boolean;
  applied: number;
  durationMs: number;
  results: MutationChangeResult[];
}
