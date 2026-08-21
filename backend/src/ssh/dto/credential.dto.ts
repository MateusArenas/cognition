import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

const KINDS = ['key', 'password'] as const;

// Importar uma chave/senha já existente. Fingerprint só é calculado se o usuário também colar a
// chave pública junto (derivar chave pública a partir da privada exigiria um parser ASN.1 por
// algoritmo — RSA/ECDSA/Ed25519 cada um do seu jeito — fora do escopo desta v1, ver
// docs/20-ssh-mobile.md#roadmap).
export class ImportCredentialDto {
  @ApiProperty({ example: 'invent-deploy' })
  @IsString()
  name!: string;

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @ApiProperty({ required: false, description: 'Chave privada em texto (PEM ou OpenSSH) — obrigatório quando kind é "key"' })
  @ValidateIf((o: ImportCredentialDto) => o.kind === 'key')
  @IsString()
  privateKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  passphrase?: string;

  @ApiProperty({ required: false, description: 'Linha "ssh-ed25519 AAAA... comentário" — opcional, habilita fingerprint' })
  @IsOptional()
  @IsString()
  publicKey?: string;

  @ApiProperty({ required: false, description: 'Senha do host — obrigatório quando kind é "password"' })
  @ValidateIf((o: ImportCredentialDto) => o.kind === 'password')
  @IsString()
  password?: string;
}

// Editar uma credencial existente. `kind` nunca muda (senão viraria outra credencial de verdade
// — hosts que já apontam pra ela ficariam com um `authMethod` incoerente). Segredo (privateKey/
// password) só é recifrado se vier preenchido — em branco significa "mantém o que já tem",
// mesmo princípio de "senha em branco = não muda" que telas de troca de senha já usam.
export class UpdateCredentialDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, description: 'Só pra kind "key" — em branco mantém a chave privada atual' })
  @IsOptional()
  @IsString()
  privateKey?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  passphrase?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  publicKey?: string;

  @ApiProperty({ required: false, description: 'Só pra kind "password" — em branco mantém a senha atual' })
  @IsOptional()
  @IsString()
  password?: string;
}

export class GenerateCredentialDto {
  @ApiProperty({ example: 'chave-nova' })
  @IsString()
  name!: string;
}

export class CredentialResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: KINDS }) kind!: string;
  @ApiProperty({ required: false }) keyType?: string | null;
  @ApiProperty({ required: false }) publicKey?: string | null;
  @ApiProperty({ required: false }) fingerprintSha256?: string | null;
  @ApiProperty() hasPassphrase!: boolean;
}
