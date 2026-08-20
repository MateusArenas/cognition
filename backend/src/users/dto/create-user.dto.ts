import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'senha-forte', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ required: false, type: [String], example: ['admin'], description: 'Nomes de roles já existentes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}
