import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID, createHash } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { AuthUserDto, LoginDto, LoginResponseDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenService } from './refresh-token.service';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  name: string;
  active: boolean;
  roles: { role: { name: string } }[];
}

function toAuthUser(user: UserRow): AuthUserDto {
  return { id: user.id, email: user.email, username: user.username, name: user.name, roles: user.roles.map((r) => r.role.name) };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly mail: MailService
  ) {}

  async register(dto: RegisterDto): Promise<LoginResponseDto> {
    const [byEmail, byUsername] = await Promise.all([
      this.prisma.user.findUnique({ where: { email: dto.email } }),
      this.prisma.user.findUnique({ where: { username: dto.username } }),
    ]);
    if (byEmail) throw new ConflictException({ message: 'Já existe um usuário com este e-mail.', code: 'EMAIL_TAKEN' });
    if (byUsername) throw new ConflictException({ message: 'Já existe um usuário com este username.', code: 'USERNAME_TAKEN' });

    const passwordHash = await bcrypt.hash(dto.password, 10);
    // Sem role nenhuma por padrão — auto-cadastro autentica (/auth/me funciona), mas só acessa
    // recursos gated por CASL depois de um admin atribuir role via PATCH /users/:id/roles.
    const user = await this.prisma.user.create({
      data: { email: dto.email, username: dto.username, name: dto.name, passwordHash },
      include: { roles: { include: { role: true } } },
    });
    return this.issueSession(user);
  }

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findByIdentifierWithRoles(dto.identifier);
    const invalid = () => new UnauthorizedException({ message: 'E-mail/username ou senha incorretos.', code: 'INVALID_CREDENTIALS' });
    if (!user || !user.active) throw invalid();

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw invalid();

    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<LoginResponseDto> {
    const unauthenticated = () => new UnauthorizedException({ message: 'Faça login novamente.', code: 'UNAUTHENTICATED' });
    let payload: { sub: string; sid: string };
    try {
      payload = await this.refreshTokens.verify(refreshToken);
    } catch {
      throw unauthenticated();
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw unauthenticated();

    const presentedHash = this.refreshTokens.hash(refreshToken);
    if (presentedHash !== session.refreshTokenHash) {
      // Token já rotacionado sendo reapresentado — sinal de roubo. Revoga TODAS as sessões
      // deste usuário, não só esta.
      await this.prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw unauthenticated();
    }

    const user = await this.users.findByIdWithRoles(session.userId);
    if (!user || !user.active) throw unauthenticated();

    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    const newRefreshToken = await this.refreshTokens.sign({ sub: user.id, sid: session.id });
    await this.prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenHash: this.refreshTokens.hash(newRefreshToken) },
    });

    return { accessToken, refreshToken: newRefreshToken, user: toAuthUser(user) };
  }

  async me(userId: string): Promise<AuthUserDto> {
    const user = await this.users.findByIdWithRoles(userId);
    if (!user) throw new UnauthorizedException({ message: 'Faça login novamente.', code: 'UNAUTHENTICATED' });
    if (!user.active) throw new ForbiddenException({ message: 'Usuário desativado.', code: 'USER_INACTIVE' });
    return toAuthUser(user);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.refreshTokens.verify(refreshToken);
    } catch {
      return; // token já morto — logout é idempotente, não é erro.
    }
    if (payload.sub !== userId) return;
    await this.prisma.session.updateMany({ where: { id: payload.sid, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Sempre "sucesso" do ponto de vista de quem chama, exista ou não o e-mail — nunca revela
    // se um endereço está cadastrado (anti-enumeração).
    if (!user) return;

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });

    await this.mail.send({
      to: user.email,
      subject: 'Redefinição de senha',
      text: `Use este token pra redefinir sua senha (válido por 1 hora): ${rawToken}`,
    });
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const record = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt) throw new BadRequestException({ message: 'Token de redefinição inválido.', code: 'RESET_TOKEN_INVALID' });
    if (record.expiresAt < new Date()) throw new BadRequestException({ message: 'Token de redefinição expirado.', code: 'RESET_TOKEN_EXPIRED' });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Senha mudou — mata todas as sessões existentes (padrão de mercado).
      this.prisma.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  private async issueSession(user: UserRow): Promise<LoginResponseDto> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    // Id gerado aqui (não pelo @default(uuid()) do Prisma) porque o refresh token precisa
    // carregar o `sid` já no payload assinado — sem isso seria preciso criar a linha com um
    // placeholder e atualizar depois, dois escritas em vez de uma.
    const sessionId = randomUUID();
    const refreshToken = await this.refreshTokens.sign({ sub: user.id, sid: sessionId });
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.refreshTokens.hash(refreshToken),
        expiresAt: this.refreshTokens.expiryOf(refreshToken),
      },
    });
    return { accessToken, refreshToken, user: toAuthUser(user) };
  }
}
