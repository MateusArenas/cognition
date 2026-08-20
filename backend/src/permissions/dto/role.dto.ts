import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  name!: string;

  @ApiProperty({ required: false, example: 'Acesso total ao painel' })
  @IsOptional()
  @IsString()
  description?: string;
}

const ACTIONS = ['manage', 'create', 'read', 'update', 'delete'] as const;
const SUBJECTS = ['Connection', 'User', 'Role', 'all'] as const;

export class AddPermissionDto {
  @ApiProperty({ enum: ACTIONS })
  @IsIn(ACTIONS)
  action!: (typeof ACTIONS)[number];

  @ApiProperty({ enum: SUBJECTS })
  @IsIn(SUBJECTS)
  subject!: (typeof SUBJECTS)[number];

  @ApiProperty({ required: false, description: 'Regra de bloqueio (cannot) em vez de liberação (can)' })
  @IsOptional()
  @IsBoolean()
  inverted?: boolean;

  @ApiProperty({ required: false, description: 'Condição estilo Mongo, ex.: {"ownerId":"$userId"}' })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
