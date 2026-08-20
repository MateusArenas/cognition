import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

// `config` espelha o knexfile inteiro (connection/pool/ssl/searchPath/...) — DB-MOBILE.md §2.8
// lista o mapa completo campo→knexfile. Validado como objeto solto de propósito: o catálogo de
// campos por dialeto (drivers.ts, no app) já impede o usuário de mandar algo fora do esperado;
// o backend confia na forma, mas nunca deixa a senha sair em claro de volta (ver mask() em
// connections.service.ts).
export class CreateConnectionDto {
  @ApiProperty({ example: 'Produção — pedidos' })
  @IsString()
  name!: string;

  @ApiProperty({ required: false, example: '#FF3B30', description: 'Bolinha colorida na lista — hábito do TablePlus: vermelho é produção' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: 'pg', description: 'Nome do client do knex: pg, mysql2, sqlite3, better-sqlite3, tedious, oracledb...' })
  @IsString()
  client!: string;

  @ApiProperty({ example: { connection: { host: 'localhost', port: 5432, user: 'app', password: 'secreta', database: 'app' } } })
  @IsObject()
  config!: Record<string, unknown>;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}

export class UpdateConnectionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  client?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  readOnly?: boolean;
}

export class TestConnectionDto {
  @ApiProperty()
  @IsString()
  client!: string;

  @ApiProperty()
  @IsObject()
  config!: Record<string, unknown>;
}

export class ConnectionResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() color!: string;
  @ApiProperty() client!: string;
  @ApiProperty() config!: Record<string, unknown>;
  @ApiProperty() readOnly!: boolean;
  @ApiProperty() connected!: boolean;
}
