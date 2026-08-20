import { ApiProperty } from '@nestjs/swagger';

// Nunca inclui passwordHash — resposta pública de /users.
export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() name!: string;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: [String] }) roles!: string[];
}
