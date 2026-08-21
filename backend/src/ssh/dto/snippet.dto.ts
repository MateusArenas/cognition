import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateSnippetDto {
  @ApiProperty({ example: 'Logs do container API' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'docker logs -f --tail 200 velox-api' })
  @IsString()
  command!: string;

  @ApiProperty({ required: false, example: 'docker' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiProperty({ required: false, default: true, description: 'Pede confirmação antes de rodar — desligar é escolha explícita do usuário' })
  @IsOptional()
  @IsBoolean()
  requireConfirm?: boolean;
}

export class UpdateSnippetDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  command?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  requireConfirm?: boolean;
}

export class SnippetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() command!: string;
  @ApiProperty({ required: false }) tag?: string | null;
  @ApiProperty() requireConfirm!: boolean;
}
