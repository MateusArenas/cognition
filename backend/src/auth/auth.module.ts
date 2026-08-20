import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
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
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
