import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../../integrations/redis/redis.service';
import { User } from '../../../database/entities/user.entity';
import { TokenDto } from '../dto/auth-response.dto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class TokenService {
  private readonly jwtSecret: string;
  private readonly accessTokenExpiresIn = 604800; // 7 days (604800s)
  private readonly refreshTokenExpiresIn = 2592000; // 30 days (2592000s)

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret =
      this.configService.get<string>('JWT_SECRET') ||
      'super-secret-key-change-in-production';
  }

  async generateTokens(user: User): Promise<TokenDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.accessTokenExpiresIn,
      }),
      this.jwtService.signAsync(
        { sub: user.id },
        {
          secret: this.jwtSecret,
          expiresIn: this.refreshTokenExpiresIn,
        },
      ),
    ]);

    // Save refresh token to Redis with TTL 7 days
    await this.redisService.set(
      `auth:refresh:${user.id}`,
      refreshToken,
      this.refreshTokenExpiresIn,
    );

    // Save user profile to Redis for fast WebSocket and Lambda message sender lookup
    await this.redisService.set(
      `user:profile:${user.id}`,
      JSON.stringify({
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl || null,
        status: user.status,
      }),
      this.refreshTokenExpiresIn,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        refreshToken,
        {
          secret: this.jwtSecret,
        },
      );

      const storedToken = await this.redisService.get(
        `auth:refresh:${payload.sub}`,
      );
      if (!storedToken || storedToken !== refreshToken) {
        throw new UnauthorizedException(
          'Refresh token is invalid or has expired',
        );
      }

      return payload as JwtPayload;
    } catch {
      throw new UnauthorizedException(
        'Refresh token is invalid or has expired',
      );
    }
  }

  async revokeRefreshToken(userId: string): Promise<void> {
    await this.redisService.del(`auth:refresh:${userId}`);
  }
}
