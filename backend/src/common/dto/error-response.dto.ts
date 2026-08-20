import { ApiProperty } from '@nestjs/swagger';

// Formato de erro único que o app mobile entende em toda a API — ver DB-MOBILE.md §3
// ("Erro sempre no mesmo formato") e §4.10.
export class ErrorResponseDto {
  @ApiProperty({ example: 'relação "pedidoss" não existe' })
  message!: string;

  @ApiProperty({ required: false, example: '42P01' })
  code?: string;

  @ApiProperty({ required: false, example: 15 })
  position?: number;

  @ApiProperty({ required: false, example: 'Talvez você quis dizer "pedidos".' })
  hint?: string;
}
