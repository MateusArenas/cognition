import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class QueryDto {
  @ApiProperty({ example: 'select * from customers where email ilike \'%@exemplo.com\'' })
  @IsString()
  @MinLength(1)
  sql!: string;
}
