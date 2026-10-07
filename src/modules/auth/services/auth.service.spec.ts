import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  getRepositoryToken: (entity: unknown) => entity,
}));

import { AuthService } from './auth.service';
import { UserService } from '../../user/services/user.service';
import { TokenService } from './token.service';
import {
  User,
  UserRole,
  UserStatus,
} from '../../../database/entities/user.entity';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<Partial<UserService>>;
  let tokenService: jest.Mocked<Partial<TokenService>>;

  const mockUser: User = {
    id: 'user-uuid-123',
    email: 'test@example.com',
    username: 'testuser',
    password: '$2b$10$hashedpassword',
    fullName: 'Test User',
    avatarUrl: null,
    bio: null,
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTokens = {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-123',
    expiresIn: 900,
  };

  beforeEach(async () => {
    userService = {
      checkExisting: jest.fn(),
      create: jest.fn(),
      findByIdentifierWithPassword: jest.fn(),
      findById: jest.fn(),
      updateLastLogin: jest.fn(),
    };

    tokenService = {
      generateTokens: jest.fn(),
      verifyRefreshToken: jest.fn(),
      revokeRefreshToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: TokenService, useValue: tokenService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      userService.checkExisting!.mockResolvedValue({
        emailExists: false,
        usernameExists: false,
      });
      userService.create!.mockResolvedValue(mockUser);
      tokenService.generateTokens!.mockResolvedValue(mockTokens);

      const result = await authService.register({
        email: 'test@example.com',
        username: 'testuser',
        password: 'Password@123',
        fullName: 'Test User',
      });

      expect(result.user.email).toBe(mockUser.email);
      expect(result.tokens).toEqual(mockTokens);
      expect(userService.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email exists', async () => {
      userService.checkExisting!.mockResolvedValue({
        emailExists: true,
        usernameExists: false,
      });

      await expect(
        authService.register({
          email: 'test@example.com',
          username: 'testuser',
          password: 'Password@123',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if username exists', async () => {
      userService.checkExisting!.mockResolvedValue({
        emailExists: false,
        usernameExists: true,
      });

      await expect(
        authService.register({
          email: 'test@example.com',
          username: 'testuser',
          password: 'Password@123',
          fullName: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully with correct credentials', async () => {
      userService.findByIdentifierWithPassword!.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      tokenService.generateTokens!.mockResolvedValue(mockTokens);
      userService.updateLastLogin!.mockResolvedValue(undefined);

      const result = await authService.login({
        identifier: 'test@example.com',
        password: 'Password@123',
      });

      expect(result.user.id).toBe(mockUser.id);
      expect(result.tokens).toEqual(mockTokens);
      expect(userService.updateLastLogin).toHaveBeenCalledWith(mockUser.id);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      userService.findByIdentifierWithPassword!.mockResolvedValue(null);

      await expect(
        authService.login({
          identifier: 'wrong@example.com',
          password: 'Password@123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      userService.findByIdentifierWithPassword!.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      await expect(
        authService.login({
          identifier: 'test@example.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if user is banned', async () => {
      userService.findByIdentifierWithPassword!.mockResolvedValue({
        ...mockUser,
        status: UserStatus.BANNED,
      });
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);

      await expect(
        authService.login({
          identifier: 'test@example.com',
          password: 'Password@123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('refreshToken', () => {
    it('should refresh tokens when refresh token is valid', async () => {
      tokenService.verifyRefreshToken!.mockResolvedValue({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
      userService.findById!.mockResolvedValue(mockUser);
      tokenService.generateTokens!.mockResolvedValue(mockTokens);

      const result = await authService.refreshToken({
        refreshToken: 'valid-token',
      });

      expect(result).toEqual(mockTokens);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token successfully', async () => {
      tokenService.revokeRefreshToken!.mockResolvedValue(undefined);

      const result = await authService.logout(mockUser.id);

      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual({ message: 'Đăng xuất thành công' });
    });
  });

  describe('getMe', () => {
    it('should return user profile', async () => {
      userService.findById!.mockResolvedValue(mockUser);

      const result = await authService.getMe(mockUser.id);

      expect(result.id).toBe(mockUser.id);
      expect(result.email).toBe(mockUser.email);
    });

    it('should throw NotFoundException if user not found', async () => {
      userService.findById!.mockResolvedValue(null);

      await expect(authService.getMe('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
