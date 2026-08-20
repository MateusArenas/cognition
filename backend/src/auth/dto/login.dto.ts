import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'senha-forte' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  user!: { id: string; email: string; name: string; roles: string[] };
}
