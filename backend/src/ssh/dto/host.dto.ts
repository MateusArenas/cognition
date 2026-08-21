import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const AUTH_METHODS = ['key', 'password'] as const;

export class CreateHostDto {
  @ApiProperty({ example: 'Velox PROD API' })
  @IsString()
  label!: string;

  @ApiProperty({ example: '189.84.220.14' })
  @IsString()
  address!: string;

  @ApiProperty({ required: false, default: 22 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ example: 'deploy' })
  @IsString()
  username!: string;

  @ApiProperty({ enum: AUTH_METHODS })
  @IsIn(AUTH_METHODS)
  authMethod!: (typeof AUTH_METHODS)[number];

  @ApiProperty({ required: false, description: 'SshCredential.id — obrigatório quando authMethod é "key"' })
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiProperty({ required: false, example: 'Produção' })
  @IsOptional()
  @IsString()
  groupName?: string;

  @ApiProperty({ required: false, type: [String], example: ['prod', 'api'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false, example: '#FF3B30' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  keepalive?: boolean;

  @ApiProperty({ required: false, description: 'Comando escrito no stream logo após abrir o shell — nunca coloque segredo aqui.' })
  @IsOptional()
  @IsString()
  startupCommand?: string;
}

export class UpdateHostDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ required: false, enum: AUTH_METHODS })
  @IsOptional()
  @IsIn(AUTH_METHODS)
  authMethod?: (typeof AUTH_METHODS)[number];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  credentialId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  groupName?: string;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  keepalive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  startupCommand?: string;
}

export class HostResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() address!: string;
  @ApiProperty() port!: number;
  @ApiProperty() username!: string;
  @ApiProperty({ enum: AUTH_METHODS }) authMethod!: string;
  @ApiProperty({ required: false }) credentialId?: string | null;
  @ApiProperty({ required: false }) groupName?: string | null;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty() color!: string;
  @ApiProperty() keepalive!: boolean;
  @ApiProperty({ required: false }) startupCommand?: string | null;
  @ApiProperty({ required: false }) lastConnectedAt?: Date | null;
}
