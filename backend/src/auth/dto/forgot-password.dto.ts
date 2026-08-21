import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ana@exemplo.com' })
  @IsEmail()
  email!: string;
}
