import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ana_souza' })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/, { message: 'username deve ter 3-32 caracteres (letras, números, ".", "_" ou "-").' })
  username!: string;

  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'senha-forte', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
}
