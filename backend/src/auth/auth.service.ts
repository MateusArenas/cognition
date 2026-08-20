import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const user = await this.users.findByEmailWithRoles(dto.email);
    const invalid = () => new UnauthorizedException({ message: 'E-mail ou senha incorretos.', code: 'INVALID_CREDENTIALS' });
    if (!user || !user.active) throw invalid();

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw invalid();

    const roles = user.roles.map((r) => r.role.name);
    const accessToken = await this.jwt.signAsync({ sub: user.id, email: user.email });
    return { accessToken, user: { id: user.id, email: user.email, name: user.name, roles } };
  }
}
