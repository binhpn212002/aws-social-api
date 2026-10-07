# Thiết kế chi tiết (Detail Design): Module Authentication & User

Tài liệu thiết kế chi tiết kỹ thuật cho module **Authentication** và **User** dựa trên [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/auth/basic-design.md), tuân thủ nguyên tắc kiến trúc trong [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md) và [implement.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/implement.promt.md).

---

## 1. Cấu trúc file & thư mục triển khai

```text
src/
├── database/
│   └── entities/
│       └── user.entity.ts                     # User Entity kế thừa BaseEntity
├── common/
│   ├── decorators/
│   │   ├── public.decorator.ts                # Decorator đánh dấu public route (đã có)
│   │   └── current-user.decorator.ts          # Decorator trích xuất user từ request
│   └── guards/
│       └── jwt-auth.guard.ts                  # Guard xác thực JWT toàn cục (hỗ trợ @Public)
├── integrations/
│   └── redis/
│       ├── redis.module.ts                    # Redis client provider
│       └── redis.service.ts                   # Thao tác get/set/del/expire token
├── modules/
│   ├── user/
│   │   ├── repositories/
│   │   │   └── user.repository.ts            # Kế thừa BaseRepository<User>
│   │   ├── services/
│   │   │   └── user.service.ts                # Kế thừa BaseService<User>
│   │   └── user.module.ts
│   └── auth/
│       ├── auth.controller.ts                 # /api/v1/auth routes
│       ├── auth.module.ts
│       ├── services/
│       │   ├── auth.service.ts                # Nghiệp vụ register, login, refresh, logout
│       │   └── token.service.ts               # Ký & verify JWT token, tương tác Redis
│       ├── strategies/
│       │   └── jwt.strategy.ts                # Passport JWT Strategy
│       └── dto/
│           ├── register.dto.ts
│           ├── login.dto.ts
│           ├── refresh-token.dto.ts
│           └── auth-response.dto.ts
```

---

## 2. Chi tiết Entity & Database Schema

### 2.1. File: `src/database/entities/user.entity.ts`
Kế thừa [BaseEntity](file:///Users/macos/project/personal/aws/social/social-api/src/shared/base.entity.ts) (`id: string (UUID)`, `createdAt`, `updatedAt`, `deletedAt`).

```typescript
import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { TABLE_NAMES } from '../../common/constants/module.constant';

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BANNED = 'BANNED',
}

@Entity({ name: TABLE_NAMES.USERS || 'users' })
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'varchar', length: 100, name: 'full_name' })
  fullName: string;

  @Column({ type: 'text', nullable: true, name: 'avatar_url' })
  avatarUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  bio?: string | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Index()
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({
    type: 'timestamp with time zone',
    nullable: true,
    name: 'last_login_at',
  })
  lastLoginAt?: Date | null;
}
```

---

## 3. Data Transfer Objects (DTO)

### 3.1. `src/modules/auth/dto/register.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email của người dùng' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @ApiProperty({
    example: 'nguyenvana',
    description: 'Username duy nhất, chỉ chứa ký tự thường, số và gạch dưới',
  })
  @IsString()
  @Length(3, 30, { message: 'Username phải từ 3 đến 30 ký tự' })
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Username chỉ được chứa chữ thường (a-z), chữ số (0-9) và dấu gạch dưới (_)',
  })
  username: string;

  @ApiProperty({
    example: 'P@ssword123',
    description: 'Mật khẩu tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  @IsString()
  @Length(8, 64, { message: 'Mật khẩu phải từ 8 đến 64 ký tự' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt (@$!%*?&)',
    },
  )
  password: string;

  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên đầy đủ' })
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @Length(2, 100, { message: 'Họ và tên phải từ 2 đến 100 ký tự' })
  fullName: string;
}
```

### 3.2. `src/modules/auth/dto/login.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email hoặc username người dùng',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email hoặc username không được để trống' })
  identifier: string;

  @ApiProperty({ example: 'P@ssword123', description: 'Mật khẩu' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;
}
```

### 3.3. `src/modules/auth/dto/refresh-token.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({ example: 'eyJhbGciOi...', description: 'Refresh Token' })
  @IsString()
  @IsNotEmpty({ message: 'Refresh token không được để trống' })
  refreshToken: string;
}
```

### 3.4. `src/modules/auth/dto/auth-response.dto.ts`
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../database/entities/user.entity';

export class TokenDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty({ example: 900, description: 'Thời gian hết hạn tính bằng giây (15 phút)' })
  expiresIn: number;
}

export class UserProfileDto {
  @ApiProperty({ example: 'b6a82741-2cbe-4c4f-a9cb-b61005d58ff3' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'nguyenvana' })
  username: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  fullName: string;

  @ApiProperty({ nullable: true })
  avatarUrl?: string | null;

  @ApiProperty({ nullable: true })
  bio?: string | null;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  status: UserStatus;

  @ApiProperty()
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({ type: () => UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ type: () => TokenDto })
  tokens: TokenDto;
}
```

---

## 4. Chi tiết Repository & Service

### 4.1. UserRepository (`src/modules/user/repositories/user.repository.ts`)
Kế thừa [BaseRepository](file:///Users/macos/project/personal/aws/social/social-api/src/common/repositories/base.repository.ts):
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { User } from '../../../database/entities/user.entity';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    repository: Repository<User>,
  ) {
    super(repository);
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.repository.findOne({
      where: [{ email: identifier }, { username: identifier }],
    });
  }

  async findByIdentifierWithPassword(identifier: string): Promise<User | null> {
    return this.repository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :identifier OR user.username = :identifier', {
        identifier,
      })
      .getOne();
  }

  async checkExisting(email: string, username: string): Promise<{ emailExists: boolean; usernameExists: boolean }> {
    const existing = await this.repository.find({
      where: [{ email }, { username }],
      select: ['id', 'email', 'username'],
    });

    return {
      emailExists: existing.some((u) => u.email.toLowerCase() === email.toLowerCase()),
      usernameExists: existing.some((u) => u.username.toLowerCase() === username.toLowerCase()),
    };
  }
}
```

### 4.2. UserService (`src/modules/user/services/user.service.ts`)
Kế thừa [BaseService](file:///Users/macos/project/personal/aws/social/social-api/src/shared/base.service.ts):
```typescript
import { Injectable } from '@nestjs/common';
import { BaseService } from '../../../shared/base.service';
import { User } from '../../../database/entities/user.entity';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class UserService extends BaseService<User, UserRepository> {
  constructor(userRepository: UserRepository) {
    super(userRepository);
  }

  async findByEmailOrUsername(identifier: string): Promise<User | null> {
    return this.repository.findByEmailOrUsername(identifier);
  }

  async findByIdentifierWithPassword(identifier: string): Promise<User | null> {
    return this.repository.findByIdentifierWithPassword(identifier);
  }

  async checkExisting(email: string, username: string) {
    return this.repository.checkExisting(email, username);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.repository.update(id, { lastLoginAt: new Date() });
  }
}
```

---

## 5. Module Token & Redis Integration

### 5.1. RedisService (`src/integrations/redis/redis.service.ts`)
```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;

  constructor(private configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password') || undefined,
    });
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
```

### 5.2. TokenService (`src/modules/auth/services/token.service.ts`)
- **Access Token TTL**: 900 giây (15 phút).
- **Refresh Token TTL**: 604800 giây (7 ngày).
- **Key Redis**: `auth:refresh:${userId}`.

```typescript
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface GeneratedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
```

Logic phương thức:
1. `generateTokens(user: User): Promise<GeneratedTokens>`:
   - Ký `accessToken` với `sub = user.id, email = user.email, role = user.role`.
   - Ký `refreshToken` với `sub = user.id`.
   - Lưu vào Redis: `await redisService.set('auth:refresh:' + user.id, refreshToken, 7 * 86400)`.
   - Trả về `{ accessToken, refreshToken, expiresIn: 900 }`.
2. `verifyRefreshToken(refreshToken: string): Promise<JwtPayload>`:
   - Verify chữ ký JWT qua `jwtService.verifyAsync`.
   - Lấy token lưu trong Redis theo key `auth:refresh:${payload.sub}`.
   - Nếu không khớp hoặc không tồn tại → throw `UnauthorizedException('Refresh token is invalid or has expired')`.
3. `revokeRefreshToken(userId: string): Promise<void>`:
   - Gọi `redisService.del('auth:refresh:' + userId)`.

---

## 6. AuthService (`src/modules/auth/services/auth.service.ts`)

### Chi tiết các hàm nghiệp vụ:

#### 6.1. `register(dto: RegisterDto): Promise<AuthResponseDto>`
1. Gọi `userService.checkExisting(dto.email, dto.username)`.
2. Nếu `emailExists` → ném `ConflictException('Email đã được sử dụng')`.
3. Nếu `usernameExists` → ném `ConflictException('Username đã được sử dụng')`.
4. Băm mật khẩu: `const hashedPassword = await bcrypt.hash(dto.password, 10)`.
5. Tạo user mới với `role: UserRole.USER`, `status: UserStatus.ACTIVE`.
6. Lưu qua `userService.create(...)`.
7. Sinh cặp token qua `tokenService.generateTokens(newUser)`.
8. Trả về `{ user: UserProfileDto, tokens: TokenDto }`.

#### 6.2. `login(dto: LoginDto): Promise<AuthResponseDto>`
1. Gọi `userService.findByIdentifierWithPassword(dto.identifier)`.
2. Nếu không tìm thấy user → ném `UnauthorizedException('Thông tin đăng nhập không chính xác')`.
3. So sánh mật khẩu: `const isMatch = await bcrypt.compare(dto.password, user.password)`.
4. Nếu `!isMatch` → ném `UnauthorizedException('Thông tin đăng nhập không chính xác')`.
5. Kiểm tra trạng thái tài khoản:
   - Nếu `user.status === UserStatus.BANNED` → ném `ForbiddenException('Tài khoản của bạn đã bị khóa')`.
   - Nếu `user.status === UserStatus.INACTIVE` → ném `ForbiddenException('Tài khoản chưa được kích hoạt')`.
6. Cập nhật `lastLoginAt`: `await userService.updateLastLogin(user.id)`.
7. Ký token: `const tokens = await tokenService.generateTokens(user)`.
8. Trả về `{ user: UserProfileDto, tokens: TokenDto }`.

#### 6.3. `refreshToken(dto: RefreshTokenDto): Promise<TokenDto>`
1. Xác thực qua `const payload = await tokenService.verifyRefreshToken(dto.refreshToken)`.
2. Tìm user: `const user = await userService.findById(payload.sub)`.
3. Nếu không thấy user hoặc user không active → ném `UnauthorizedException()`.
4. Sinh cặp token mới (Token Rotation): `return tokenService.generateTokens(user)`.

#### 6.4. `logout(userId: string): Promise<{ message: string }>`
1. Gọi `await tokenService.revokeRefreshToken(userId)`.
2. Trả về `{ message: 'Đăng xuất thành công' }`.

#### 6.5. `getMe(userId: string): Promise<UserProfileDto>`
1. Gọi `const user = await userService.findById(userId)`.
2. Nếu không có → ném `NotFoundException('Không tìm thấy người dùng')`.
3. Trả về `UserProfileDto`.

---

## 7. Controller & Định tuyến API

### File: `src/modules/auth/auth.controller.ts`

```typescript
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản mới' })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập tài khoản' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới Access Token' })
  @ApiResponse({ status: 200, type: TokenDto })
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<TokenDto> {
    return this.authService.refreshToken(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đăng xuất' })
  async logout(@CurrentUser('sub') userId: string) {
    return this.authService.logout(userId);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  async getMe(@CurrentUser('sub') userId: string) {
    return this.authService.getMe(userId);
  }
}
```

---

## 8. Strategy, Guards & Decorators

### 8.1. `JwtStrategy` (`src/modules/auth/strategies/jwt.strategy.ts`)
- Trích xuất token từ header: `ExtractJwt.fromAuthHeaderAsBearerToken()`.
- Xác minh với `configService.get('JWT_SECRET')`.
- Hàm `validate(payload: JwtPayload)`: trả về `{ userId: payload.sub, email: payload.email, role: payload.role }`.

### 8.2. `JwtAuthGuard` (`src/common/guards/jwt-auth.guard.ts`)
- Kế thừa `AuthGuard('jwt')`.
- Đọc metadata `IS_PUBLIC_KEY` từ context qua `Reflector`.
- Nếu `@Public()` → `return true` (cho phép request đi qua không cần token).
- Nếu không → thực thi kiểm tra JWT chuẩn của Passport.

### 8.3. `CurrentUser` (`src/common/decorators/current-user.decorator.ts`)
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
```

---

## 9. Ma trận kiểm thử (Test Cases)

| STT | Case Test | Dữ liệu đầu vào | Kết quả mong đợi |
| :---: | :--- | :--- | :--- |
| 1 | Register thành công | Dữ liệu hợp lệ, email & username mới | HTTP 201, trả về user profile và token |
| 2 | Register trùng email | Email đã tồn tại | HTTP 409 Conflict |
| 3 | Register trùng username | Username đã tồn tại | HTTP 409 Conflict |
| 4 | Register mật khẩu yếu | Mật khẩu thiếu ký tự hoa/đặc biệt | HTTP 400 Validation Error |
| 5 | Login thành công bằng email | Email đúng + password đúng | HTTP 200, tokens + user |
| 6 | Login thành công bằng username | Username đúng + password đúng | HTTP 200, tokens + user |
| 7 | Login sai password | Password không đúng | HTTP 401 Unauthorized |
| 8 | Login tài khoản bị khóa | Status = BANNED | HTTP 403 Forbidden |
| 9 | Refresh Token thành công | Refresh token hợp lệ, khớp Redis | HTTP 200, tokens mới |
| 10 | Refresh Token hết hạn/sai | Token không tồn tại trong Redis | HTTP 401 Unauthorized |
| 11 | Logout thành công | Bearer access token hợp lệ | HTTP 200, key Redis bị xóa |
| 12 | Get /me có token | Bearer access token hợp lệ | HTTP 200, trả về thông tin user |
| 13 | Get /me không có token | Không truyền Bearer token | HTTP 401 Unauthorized |
