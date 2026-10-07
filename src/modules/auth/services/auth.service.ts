import { Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { UserService } from '../../user/services/user.service';
import { TokenService } from './token.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import {
  AuthResponseDto,
  TokenDto,
  UserProfileDto,
} from '../dto/auth-response.dto';
import {
  User,
  UserRole,
  UserStatus,
} from '../../../database/entities/user.entity';
import {
  EmailAlreadyExistsException,
  UsernameAlreadyExistsException,
  InvalidCredentialsException,
  UserBannedException,
  UserInactiveException,
  UserInactiveOrNotFoundException,
  UserNotFoundException,
} from '../../../common/exceptions/user.exception';
import { AuditLogEvent } from '../../audit-logs/events/audit-log.event';
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
} from '../../audit-logs/interfaces/audit-log.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  private emitAuditLog(event: AuditLogEvent): void {
    if (this.eventEmitter) {
      this.eventEmitter.emit('audit.log', event);
    }
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const { emailExists, usernameExists } =
      await this.userService.checkExisting(dto.email, dto.username);

    if (emailExists) {
      throw new EmailAlreadyExistsException();
    }
    if (usernameExists) {
      throw new UsernameAlreadyExistsException();
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = await this.userService.create({
      email: dto.email.toLowerCase(),
      username: dto.username.toLowerCase(),
      password: hashedPassword,
      fullName: dto.fullName,
      role: UserRole.USER,
      status: UserStatus.ACTIVE,
    });

    const tokens = await this.tokenService.generateTokens(newUser);

    return {
      user: this.mapToUserProfile(newUser),
      tokens,
    };
  }

  async login(
    dto: LoginDto,
    clientIp: string = '127.0.0.1',
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    const user = await this.userService.findByIdentifierWithPassword(
      dto.identifier.toLowerCase(),
    );

    if (!user) {
      this.emitAuditLog(
        new AuditLogEvent({
          identifier: dto.identifier,
          category: AuditCategory.AUTH,
          action: AuditAction.LOGIN_FAILED,
          status: AuditStatus.FAILURE,
          failureReason: 'USER_NOT_FOUND',
          ipAddress: clientIp,
          userAgent,
        }),
      );
      throw new InvalidCredentialsException();
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      this.emitAuditLog(
        new AuditLogEvent({
          userId: user.id,
          identifier: dto.identifier,
          category: AuditCategory.AUTH,
          action: AuditAction.LOGIN_FAILED,
          status: AuditStatus.FAILURE,
          failureReason: 'INVALID_PASSWORD',
          ipAddress: clientIp,
          userAgent,
        }),
      );
      throw new InvalidCredentialsException();
    }

    if (user.status === UserStatus.BANNED) {
      this.emitAuditLog(
        new AuditLogEvent({
          userId: user.id,
          identifier: user.email,
          category: AuditCategory.AUTH,
          action: AuditAction.LOGIN_FAILED,
          status: AuditStatus.FAILURE,
          failureReason: 'USER_BANNED',
          ipAddress: clientIp,
          userAgent,
        }),
      );
      throw new UserBannedException();
    }
    if (user.status === UserStatus.INACTIVE) {
      this.emitAuditLog(
        new AuditLogEvent({
          userId: user.id,
          identifier: user.email,
          category: AuditCategory.AUTH,
          action: AuditAction.LOGIN_FAILED,
          status: AuditStatus.FAILURE,
          failureReason: 'USER_INACTIVE',
          ipAddress: clientIp,
          userAgent,
        }),
      );
      throw new UserInactiveException();
    }

    await this.userService.updateLastLogin(user.id);
    const tokens = await this.tokenService.generateTokens(user);

    this.emitAuditLog(
      new AuditLogEvent({
        userId: user.id,
        identifier: user.email,
        category: AuditCategory.AUTH,
        action: AuditAction.LOGIN_SUCCESS,
        status: AuditStatus.SUCCESS,
        ipAddress: clientIp,
        userAgent,
      }),
    );

    return {
      user: this.mapToUserProfile(user),
      tokens,
    };
  }

  async refreshToken(
    dto: RefreshTokenDto,
    clientIp: string = '127.0.0.1',
    userAgent?: string,
  ): Promise<TokenDto> {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
    );

    const user = await this.userService.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UserInactiveOrNotFoundException();
    }

    this.emitAuditLog(
      new AuditLogEvent({
        userId: user.id,
        identifier: user.email,
        category: AuditCategory.AUTH,
        action: AuditAction.REFRESH_TOKEN,
        status: AuditStatus.SUCCESS,
        ipAddress: clientIp,
        userAgent,
      }),
    );

    return this.tokenService.generateTokens(user);
  }

  async logout(
    userId: string,
    clientIp: string = '127.0.0.1',
    userAgent?: string,
  ): Promise<{ message: string }> {
    await this.tokenService.revokeRefreshToken(userId);

    const user = await this.userService.findById(userId);
    this.emitAuditLog(
      new AuditLogEvent({
        userId,
        identifier: user ? user.email : userId,
        category: AuditCategory.AUTH,
        action: AuditAction.LOGOUT,
        status: AuditStatus.SUCCESS,
        ipAddress: clientIp,
        userAgent,
      }),
    );

    return { message: 'Đăng xuất thành công' };
  }

  async getMe(userId: string): Promise<UserProfileDto> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UserNotFoundException();
    }

    return this.mapToUserProfile(user);
  }

  private mapToUserProfile(user: User): UserProfileDto {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl ?? null,
      bio: user.bio ?? null,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    };
  }
}
