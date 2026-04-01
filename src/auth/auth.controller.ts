import { Controller, Post, Req, UseGuards, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshJwtAuthGuard } from './guards/refresh-jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'Login and get access/refresh tokens' })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh tokens with refresh bearer token' })
  @UseGuards(RefreshJwtAuthGuard)
  @Post('refresh')
  refresh(@Req() req: { user: { sub: number; refreshToken: string } }) {
    return this.authService.refresh(req.user.sub, req.user.refreshToken);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: { user: { sub: number } }) {
    return this.authService.logout(req.user.sub);
  }
}
