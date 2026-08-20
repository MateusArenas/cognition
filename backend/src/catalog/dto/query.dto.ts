import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class QueryDto {
  @ApiProperty({ example: 'select * from customers where email ilike \'%@exemplo.com\'' })
  @IsString()
  @MinLength(1)
  sql!: string;

  @ApiProperty({
    required: false,
    default: false,
    description: 'Libera INSERT/UPDATE/DELETE no console (aba Consulta, toggle explícito do usuário) — sql-safety.ts ainda bloqueia DDL/administrativo sempre, e introspect.service.ts cruza com connection.readOnly antes de executar.',
  })
  @IsOptional()
  @IsBoolean()
  allowWrite?: boolean;
}
