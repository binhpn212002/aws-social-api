# Kế hoạch phát triển (Implementation Plan): Module Audit Logs (Lưu trữ độc quyền trên Amazon DynamoDB)

Tài liệu kế hoạch phát triển cho module **Audit Logs** dựa trên [detail-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/audit-logs/detail-design.md) và [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/audit-logs/basic-design.md) theo quy chuẩn [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md).

Toàn bộ dữ liệu kiểm toán hoạt động và bảo mật được lưu trữ **độc quyền trên Amazon DynamoDB** (`social-audit-logs`), hoàn toàn không tạo bảng hay entity trong PostgreSQL, đảm bảo cơ sở dữ liệu quan hệ chính không bị phình to và tối ưu hóa hiệu năng cao ở quy mô lớn.

---

## 1. Cấu trúc thư mục áp dụng

```text
src/
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts          # Đã có - trích xuất user từ JWT Request
│   │   └── roles.decorator.ts                 # Decorator @Roles('ADMIN')
│   ├── guards/
│   │   ├── jwt-auth.guard.ts                  # Đã có - xác thực JWT Bearer
│   │   └── roles.guard.ts                     # Guard kiểm tra Role ADMIN
│   └── utils/
│       └── client-info.util.ts                # Trích xuất IP thật (CloudFront/ALB) & chuẩn hóa DeviceInfo
├── modules/
│   ├── auth/
│   │   └── services/auth.service.ts           # Tích hợp phát event 'audit.log' khi đăng nhập, đổi mật khẩu,...
│   └── audit-logs/
│       ├── audit-logs.controller.ts           # API Controller /api/v1/audit-logs (/me, /, /:id)
│       ├── audit-logs.module.ts               # Khai báo AuditLogsModule
│       ├── services/
│       │   └── audit-log.service.ts           # Nghiệp vụ truy vấn, ghi log & phân tích Brute-Force
│       ├── repositories/
│       │   └── audit-log.repository.ts        # Tương tác DynamoDB bằng DynamoDBDocumentClient
│       ├── listeners/
│       │   └── audit-log.listener.ts          # OnEvent('audit.log') xử lý bất đồng bộ phi chặn
│       ├── events/
│       │   └── audit-log.event.ts             # Cấu trúc sự kiện AuditLogEvent
│       ├── interfaces/
│       │   └── audit-log.interface.ts         # TypeScript Interface & Enums (AuditCategory, AuditAction, AuditStatus)
│       └── dto/
│           ├── get-my-audit-logs-query.dto.ts # DTO phân trang lịch sử cá nhân (Cursor pagination)
│           ├── get-audit-logs-query.dto.ts    # DTO lọc đa tiêu chí cho Quản trị viên (Admin)
│           └── audit-log-response.dto.ts      # DTO trả về danh sách kèm cursor & chi tiết log
```

---

## 2. Kế hoạch triển khai từng bước

### Giai đoạn 1: Chuẩn bị Cấu hình AWS DynamoDB & Interfaces
- [x] Kiểm tra cấu hình DynamoDB trong [src/config/aws.config.ts](file:///Users/macos/project/personal/aws/social/social-api/src/config/aws.config.ts):
  - Biến cấu hình `aws.dynamodb.auditLogTableName` (mặc định: `social-audit-logs`).
  - Region `aws.dynamodb.region` (mặc định: `ap-southeast-1`).
- [x] Cài đặt các gói thư viện AWS SDK v3 cho DynamoDB nếu chưa có:
  - `@aws-sdk/client-dynamodb`
  - `@aws-sdk/lib-dynamodb`
- [x] Tạo file [src/modules/audit-logs/interfaces/audit-log.interface.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/interfaces/audit-log.interface.ts):
  - Khai báo Enums: `AuditCategory` (`AUTH`, `ACCOUNT_SECURITY`, `ADMIN_ACTION`).
  - Khai báo Enums: `AuditAction` (`LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `REFRESH_TOKEN`, `CHANGE_PASSWORD_SUCCESS`, `CHANGE_PASSWORD_FAILED`, `FORGOT_PASSWORD_REQUEST`, `RESET_PASSWORD_SUCCESS`).
  - Khai báo Enums: `AuditStatus` (`SUCCESS`, `FAILURE`).
  - Định nghĩa interface `IAuditLogItem` ánh xạ trực tiếp cấu trúc item trên bảng DynamoDB `social-audit-logs` (PK, SK, ttl, id, userId, identifier,...).

---

### Giai đoạn 2: Tạo Data Transfer Objects (DTO) & Event Bus Class
- [x] Tạo file [src/modules/audit-logs/events/audit-log.event.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/events/audit-log.event.ts):
  - Chứa class `AuditLogEvent` mang đầy đủ thông tin ngữ cảnh (`userId`, `identifier`, `category`, `action`, `status`, `ipAddress`, `userAgent`, `failureReason`, `metadata`).
- [x] Tạo file [src/modules/audit-logs/dto/get-my-audit-logs-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/dto/get-my-audit-logs-query.dto.ts):
  - Hỗ trợ `limit` (mặc định 10, tối đa 50) và `cursor` (chuỗi con trỏ mã hóa Base64 cho DynamoDB).
- [x] Tạo file [src/modules/audit-logs/dto/get-audit-logs-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/dto/get-audit-logs-query.dto.ts):
  - Hỗ trợ lọc theo `userId`, `identifier`, `month` (định dạng `YYYY-MM`), `category`, `action`, `status`, `ipAddress`, `limit`, `cursor`.
- [x] Tạo file [src/modules/audit-logs/dto/audit-log-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/dto/audit-log-response.dto.ts):
  - Định nghĩa `AuditLogItemDto`, `AuditLogDetailResponseDto`, `DynamoPaginationMetaDto`, `AuditLogListResponseDto`.

---

### Giai đoạn 3: Tiện ích chuẩn hóa Client Info & Phân quyền Admin
- [x] Tạo tiện ích [src/common/utils/client-info.util.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/utils/client-info.util.ts):
  - `extractClientIp(req)`: Trích xuất IP client thực phía sau AWS CloudFront (`cloudfront-viewer-address`), ALB (`x-forwarded-for`), hoặc reverse proxy.
  - `parseDeviceInfo(userAgent)`: Chuẩn hóa User-Agent thành chuỗi ngắn gọn (`Chrome / macOS`, `Safari Mobile / iOS`,...).
- [x] Kiểm tra / Bổ sung Guard và Decorator phân quyền Admin:
  - Decorator `@Roles('ADMIN')` tại [src/common/decorators/roles.decorator.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/decorators/roles.decorator.ts).
  - Guard `RolesGuard` tại [src/common/guards/roles.guard.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/guards/roles.guard.ts).

---

### Giai đoạn 4: Xây dựng Repository thao tác Amazon DynamoDB
- [x] Tạo [src/modules/audit-logs/repositories/audit-log.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/repositories/audit-log.repository.ts):
  - Khởi tạo `DynamoDBClient` và `DynamoDBDocumentClient` từ `ConfigService`.
  - Cài đặt `appendLog(data)`: Ghi nhận đồng thời theo mô hình Single-Table Design qua `BatchWriteCommand`:
    1. Item dòng thời gian User (`PK: USER#{userId}`, `SK: LOG#{createdAt}#{id}`).
    2. Item tra cứu trực tiếp theo ID (`PK: LOG#{id}`, `SK: METADATA`).
    3. Item dòng thời gian hệ thống theo tháng (`PK: SYSTEM_LOGS#{YYYY-MM}`, `SK: TIMESTAMP#{createdAt}#{id}`).
    4. Nếu là thất bại (`FAILURE`), tạo thêm 2 Item trượt đếm Brute-Force (`FAILED#{identifier}` và `FAILED_IP#{ipAddress}`) với TTL ngắn 15 phút.
  - Cài đặt `getMyLogs(userId, query)`: `QueryCommand` trên `PK = USER#{userId} AND begins_with(SK, "LOG#")` với `ScanIndexForward = false` và con trỏ `ExclusiveStartKey`.
  - Cài đặt `getLogById(logId)`: `GetCommand` trên `PK = LOG#{id}, SK = METADATA` O(1) < 5ms.
  - Cài đặt `getLogsForAdmin(query)`: `QueryCommand` theo tháng `SYSTEM_LOGS#{YYYY-MM}` kết hợp `FilterExpression` cho các tiêu chí lọc.
  - Cài đặt `countRecentFailedLogins(identifier, ipAddress, windowMinutes)`: Đếm số lần thất bại gần nhất phục vụ phát hiện Brute-Force.
  - Cài đặt hàm tiện ích mã hóa/giải mã Cursor Base64 (`encodeCursor`, `decodeCursor`).

---

### Giai đoạn 5: Xây dựng Business Services & Xử lý Bất đồng bộ phi chặn
- [x] Tạo [src/modules/audit-logs/services/audit-log.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/services/audit-log.service.ts):
  - `processAuditLogEvent(event)`: Tiếp nhận event, gọi tiện ích phân tích thiết bị, lưu vào DynamoDB, kích hoạt kiểm tra Brute-Force nếu đăng nhập thất bại.
  - `detectBruteForce(identifier, ipAddress)`: Đếm số lần thất bại trong 10 phút. Nếu `>= 5 lần` -> ghi log cảnh báo an ninh `[SECURITY ALERT]`.
  - `getMyAuditLogs(userId, query)`: Trả về danh sách kèm con trỏ phân trang `nextCursor`.
  - `getAuditLogsForAdmin(query)`: Trả về danh sách toàn hệ thống cho Quản trị viên.
  - `getAuditLogDetail(id, requestUserId, isAdmin)`: Kiểm tra quyền sở hữu hoặc role Admin trước khi trả về siêu dữ liệu chi tiết.
- [x] Tạo [src/modules/audit-logs/listeners/audit-log.listener.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/listeners/audit-log.listener.ts):
  - Đăng ký `@OnEvent('audit.log', { async: true })`.
  - Gọi `AuditLogService.processAuditLogEvent(event)` trong khối `try/catch` an toàn, cách ly hoàn toàn với luồng đăng nhập chính.

---

### Giai đoạn 6: Xây dựng Controller & API Endpoints
- [x] Tạo [src/modules/audit-logs/audit-logs.controller.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/audit-logs.controller.ts) với prefix `/api/v1/audit-logs`:
  - `GET /api/v1/audit-logs/me`: Người dùng xem lịch sử an ninh của chính mình (`JwtAuthGuard`).
  - `GET /api/v1/audit-logs`: Quản trị viên lọc và xem toàn bộ nhật ký hệ thống (`JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN')`).
  - `GET /api/v1/audit-logs/:id`: Xem chi tiết 1 bản ghi kiểm toán kèm metadata (`JwtAuthGuard`).

---

### Giai đoạn 7: Khai báo Module & Tích hợp AppModule
- [x] Tạo [src/modules/audit-logs/audit-logs.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/audit-logs/audit-logs.module.ts):
  - Import `ConfigModule` và `EventEmitterModule.forRoot()`.
  - Đăng ký controller: `AuditLogController`.
  - Đăng ký providers: `AuditLogService`, `AuditLogRepository`, `AuditLogListener`.
  - Export: `AuditLogService`, `AuditLogRepository`.
- [x] Đăng ký `AuditLogsModule` vào [src/app.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/app.module.ts).

---

### Giai đoạn 8: Tích hợp phát sự kiện từ Module Auth
- [x] Cập nhật [src/modules/auth/services/auth.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/auth/services/auth.service.ts):
  - Inject `EventEmitter2`.
  - Phát event `LOGIN_SUCCESS` khi người dùng nhập đúng thông tin đăng nhập.
  - Phát event `LOGIN_FAILED` khi sai mật khẩu hoặc tài khoản không tồn tại kèm lý do thất bại.
  - Phát event `LOGOUT` khi người dùng đăng xuất khỏi hệ thống.
  - Phát event `REFRESH_TOKEN` khi cấp mới Access Token.
- [x] Cập nhật controller [src/modules/auth/auth.controller.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/auth/auth.controller.ts) để truyền `clientIp` và `userAgent` vào `AuthService`.

---

### Giai đoạn 9: Kiểm thử & Đảm bảo chất lượng (QA & Test)
- [x] Kiểm tra biên dịch TypeScript `npm run build`.
- [x] Kiểm tra định dạng mã nguồn `npm run lint`.
- [x] Viết Unit Test cho `AuditLogService` và `AuditLogListener` bao phủ các kịch bản:
  - Ghi log thành công và thất bại.
  - Phát hiện Brute-Force khi vượt ngưỡng 5 lần.
  - Kiểm tra phân quyền truy cập bản ghi chi tiết (Admin vs User thường).
  - Kiểm tra giải mã con trỏ phân trang Cursor.

---

## 3. Tổng kết Danh mục API Endpoints

| Phương thức | Đường dẫn API | Mô tả | Quyền truy cập | Cơ chế DynamoDB |
| :--- | :--- | :--- | :---: | :--- |
| `GET` | `/api/v1/audit-logs/me` | Lấy lịch sử bảo mật cá nhân | Bearer JWT (Mọi User) | `QueryCommand` trên `PK = USER#{userId}`, `ScanIndexForward = false` |
| `GET` | `/api/v1/audit-logs` | Tra cứu toàn bộ nhật ký hệ thống | Bearer JWT (`Role: ADMIN`) | `QueryCommand` trên `PK = SYSTEM_LOGS#{month}` kèm `FilterExpression` |
| `GET` | `/api/v1/audit-logs/:id` | Xem chi tiết 1 bản ghi kiểm toán | Bearer JWT (Admin hoặc Chính chủ) | `GetCommand` trên `PK = LOG#{id}, SK = METADATA` (O(1) < 5ms) |
