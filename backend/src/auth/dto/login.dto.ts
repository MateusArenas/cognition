import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ana@exemplo.com', description: 'E-mail OU username.' })
  @IsString()
  @MinLength(3)
  identifier!: string;

  @ApiProperty({ example: 'senha-forte' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  username: string | null;
  name: string;
  roles: string[];
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  user!: AuthUserDto;
}
