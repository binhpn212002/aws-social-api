# Kế hoạch phát triển (Implementation Plan): Module Authentication & User

Tài liệu kế hoạch phát triển cho module **Authentication** và **User** dựa trên [detail-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/auth/detail-design.md) theo quy chuẩn [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md).

---

## 1. Cấu trúc thư mục áp dụng

```text
src/
├── database/
│   └── entities/
│       └── user.entity.ts                     # Entity User kế thừa BaseEntity
├── common/
│   ├── constants/
│   │   └── module.constant.ts                 # Hằng số bảng USERS, roles, status
│   ├── decorators/
│   │   ├── public.decorator.ts                # @Public() decorator
│   │   └── current-user.decorator.ts          # @CurrentUser() decorator
│   └── guards/
│       └── jwt-auth.guard.ts                  # JwtAuthGuard toàn cục
├── integrations/
│   └── redis/
│       ├── redis.module.ts
│       └── redis.service.ts                   # Quản lý session / refresh token
├── modules/
│   ├── user/
│   │   ├── repositories/
│   │   │   └── user.repository.ts            # Kế thừa BaseRepository<User>
│   │   ├── services/
│   │   │   └── user.service.ts                # Kế thừa BaseService<User>
│   │   └── user.module.ts
│   └── auth/
│       ├── auth.controller.ts
│       ├── auth.module.ts
│       ├── services/
│       │   ├── auth.service.ts
│       │   └── token.service.ts
│       ├── strategies/
│       │   └── jwt.strategy.ts
│       └── dto/
│           ├── register.dto.ts
│           ├── login.dto.ts
│           ├── refresh-token.dto.ts
│           └── auth-response.dto.ts
```

---

## 2. Kế hoạch triển khai từng bước

### Giai đoạn 1: Chuẩn bị thư viện & cấu hình nền tảng
- [x] Cài đặt các thư viện xác thực: `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, `@types/passport-jwt`, `bcrypt`, `@types/bcrypt`, `ioredis`.
- [x] Khởi tạo module Redis tại [src/integrations/redis/](file:///Users/macos/project/personal/aws/social/social-api/src/integrations/redis).

### Giai đoạn 2: Entity & User Module
- [x] Tạo entity `User` tại [src/database/entities/user.entity.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/entities/user.entity.ts) kế thừa `BaseEntity`.
- [x] Tạo `UserRepository` tại [src/modules/user/repositories/user.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/user/repositories/user.repository.ts) kế thừa `BaseRepository`.
- [x] Tạo `UserService` tại [src/modules/user/services/user.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/user/services/user.service.ts) kế thừa `BaseService`.
- [x] Đăng ký `UserModule`.

### Giai đoạn 3: Authentication Infrastructure
- [x] Tạo DTOs (`RegisterDto`, `LoginDto`, `RefreshTokenDto`, `AuthResponseDto`).
- [x] Tạo `TokenService` (ký JWT và quản lý lưu token vào Redis với TTL).
- [x] Tạo `JwtStrategy` và `JwtAuthGuard` (kết hợp với decorator `@Public()`).
- [x] Tạo param decorator `@CurrentUser()`.

### Giai đoạn 4: Nghiệp vụ Auth & Endpoints
- [x] Cài đặt `AuthService` với đầy đủ logic: `register`, `login`, `refreshToken`, `logout`, `getMe`.
- [x] Cài đặt `AuthController` với các route:
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`
  - `POST /api/v1/auth/refresh-token`
  - `POST /api/v1/auth/logout`
  - `GET /api/v1/auth/me`
- [x] Đăng ký `AuthModule` và kích hoạt `JwtAuthGuard` toàn cục.

### Giai đoạn 5: Kiểm thử & Đảm bảo chất lượng
- [x] Kiểm tra biên dịch `npm run build` và linting `npm run lint`.
- [x] Tạo unit test case cho `AuthService` ([auth.service.spec.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/auth/services/auth.service.spec.ts)).
