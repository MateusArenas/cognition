import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailModule } from '../mail/mail.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    // registerAsync (não register) de propósito: o factory só roda quando o Nest MONTA o
    // módulo (DI), não quando a classe é decorada/importada — em teste, isso é depois de
    // bootstrap-app.ts já ter setado process.env.JWT_SECRET; com `register()` direto,
    // `process.env.JWT_SECRET` seria lido no import do arquivo, cedo demais.
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '8h' },
      }),
    }),
  ],
  controllers: [AuthController],
  // RefreshTokenService NÃO usa JwtModule (registerAsync acima é só do access token, secret
  // diferente) — lê JWT_REFRESH_SECRET direto por chamada, mesmo motivo de testabilidade do
  // JwtStrategy (ver refresh-token.service.ts).
  providers: [AuthService, JwtStrategy, RefreshTokenService],
})
export class AuthModule {}
