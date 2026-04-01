import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StringValue } from 'ms';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { requireConfig } from './jwt.config';
import { JwtPayload } from './types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.validateCredentials(dto.email, dto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  async refresh(userId: number, refreshToken: string) {
    const user = await this.usersService.validateRefreshToken(userId, refreshToken);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  async logout(userId: number) {
    await this.usersService.clearRefreshToken(userId);
    return { success: true };
  }

  private async issueTokens(userId: number, email: string, role: JwtPayload['role']) {
    const payload: JwtPayload = { sub: userId, email, role };
    const accessExpiresIn = (this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m') as StringValue;
    const refreshExpiresIn = (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d') as StringValue;

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: requireConfig(this.configService, 'JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: requireConfig(this.configService, 'JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    await this.usersService.setRefreshToken(userId, refreshToken);

    return {
      accessToken,
      refreshToken,
      user: { id: userId, email, role },
    };
  }
}
