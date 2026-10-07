# Kế hoạch phát triển (Implementation Plan): Module Notification (Event-Driven Queue & Lambda Handlers)

Tài liệu kế hoạch phát triển cho module **Notification** dựa trên [detail-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/notification/detail-design.md) và [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/notification/basic-design.md) theo quy chuẩn [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md).

Hệ thống được thiết kế theo kiến trúc **hướng sự kiện bất đồng bộ (Asynchronous Event-Driven)** và **phân tách độc lập hoàn toàn** giữa:
- **Ứng dụng chính (Core App - `src/`)**: NestJS Backend độc lập với môi trường cloud (Cloud-Agnostic), quản lý cơ sở dữ liệu quan hệ PostgreSQL (TypeORM), nghiệp vụ notification, đặt lịch và cung cấp endpoint callback `POST /api/v1/notifications/notify-completed`.
- **Hạ tầng máy chủ phi máy chủ (AWS Serverless Handlers - `infra/lambda-handler/`)**: Toàn bộ các AWS Lambda Handlers quản lý kết nối WebSocket và Worker tiêu thụ hàng đợi SQS, bắn tin thời gian thực và gọi callback về Core App.

---

## 1. Cấu trúc thư mục áp dụng

```text
social-api/
├── src/                                           # 💡 Core Application (NestJS Backend - Cloud Agnostic)
│   ├── database/
│   │   └── entities/
│   │       ├── notification.entity.ts             # Entity Notification kế thừa BaseEntity
│   │       └── scheduled-notification.entity.ts   # Entity ScheduledNotification kế thừa BaseEntity
│   ├── common/
│   │   ├── constants/
│   │   │   └── module.constant.ts                 # TABLE_NAMES: NOTIFICATIONS, SCHEDULED_NOTIFICATIONS
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts                  # Đã có - xác thực JWT Bearer
│   │   │   └── internal-api.guard.ts              # Guard kiểm tra x-internal-api-key cho Lambda Worker
│   │   ├── decorators/
│   │   │   └── current-user.decorator.ts          # Đã có - trích xuất user từ JWT Request
│   │   └── repositories/
│   │       └── base.repository.ts                 # Đã có - BaseRepository cho TypeORM
│   └── modules/
│       └── notification/
│           ├── notification.controller.ts         # Định tuyến /api/v1/notifications & /schedules & /notify-completed
│           ├── notification.module.ts             # Khai báo NotificationModule
│           ├── services/
│           │   ├── notification.service.ts        # Nghiệp vụ kích hoạt thông báo, cập nhật kết quả, đọc tin
│           │   ├── scheduled-notification.service.ts # Nghiệp vụ đặt lịch thông báo (AWS EventBridge Scheduler)
│           │   └── sqs-producer.service.ts        # Service đẩy message vào AWS SQS Queue
│           ├── repositories/
│           │   ├── notification.repository.ts     # Thao tác DB bảng notifications
│           │   └── scheduled-notification.repository.ts # Thao tác DB bảng scheduled_notifications
│           └── dto/
│               ├── get-notifications-query.dto.ts # Query params phân trang & lọc thông báo
│               ├── get-scheduled-notifications-query.dto.ts # Query params danh sách lịch hẹn thông báo
│               ├── create-scheduled-notification.dto.ts # DTO tạo lịch hẹn gửi thông báo cho bạn bè
│               ├── notify-completed.dto.ts        # DTO callback từ Lambda cập nhật trạng thái đã gửi
│               ├── notification-response.dto.ts   # DTO trả về chi tiết thông báo
│               └── scheduled-notification-response.dto.ts # DTO trả về chi tiết lịch hẹn
├── infra/                                         # ☁️ AWS Cloud Infrastructure & Serverless Handlers (Tách rời App)
│   └── lambda-handler/
│       ├── websocket/
│       │   ├── connect.ts                         # Lambda Handler route $connect (Xác thực JWT, lưu Redis)
│       │   ├── disconnect.ts                      # Lambda Handler route $disconnect (Dọn dẹp Redis)
│       │   └── default.ts                         # Lambda Handler route $default / ping (Keep-Alive)
│       ├── notification/
│       │   ├── consumer.ts                        # Lambda Handler SQS Consumer (Push WS & gọi callback API)
│       │   └── dlq-consumer.ts                    # Lambda Handler Dead Letter Queue (Ghi nhận FAILED)
│       └── utils/
│           ├── redis.util.ts                      # Singleton Redis client với auto-reconnect
│           └── jwt-verifier.util.ts               # Helper kiểm tra token JWT trong môi trường Lambda
└── sst.config.ts                                  # Cấu hình SST v3 kết nối hạ tầng AWS & Lambda Handlers
```

---

## 2. Kế hoạch triển khai từng bước (Phase-by-Phase Execution Plan)

### Giai đoạn 1: Chuẩn bị CSDL & Entities TypeORM
- [x] Bổ sung tên bảng vào [src/common/constants/module.constant.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/constants/module.constant.ts):
  - `NOTIFICATIONS: 'notifications'`
  - `SCHEDULED_NOTIFICATIONS: 'scheduled_notifications'`
- [x] Tạo file [src/database/entities/notification.entity.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/entities/notification.entity.ts):
  - Khai báo Enums: `NotificationType`, `NotificationStatus` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`).
  - Khai báo Entity `Notification` kế thừa `BaseEntity` với các trường `recipientId`, `senderId`, `type`, `title`, `message`, `referenceId`, `referenceType`, `status`, `isRead`, `readAt`, `sentAt`, `errorMessage`.
  - Thiết lập các chỉ mục tối ưu: `['recipientId', 'createdAt']`, `['recipientId', 'isRead']`, `['recipientId', 'status']`.
- [x] Tạo file [src/database/entities/scheduled-notification.entity.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/entities/scheduled-notification.entity.ts):
  - Khai báo Enums: `ScheduleTargetType` (`ALL_FRIENDS`, `SELECTED_FRIENDS`), `ScheduleNotificationStatus`.
  - Khai báo Entity `ScheduledNotification` kế thừa `BaseEntity` với các trường `userId`, `title`, `content`, `scheduledAt`, `targetType`, `targetUserIds`, `status`, `schedulerArn`, `totalRecipients`, `sentAt`.
- [x] Đăng ký 2 entities mới vào cấu hình TypeORM trong [src/database/typeorm.config.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/typeorm.config.ts) và `AppModule`.

---

### Giai đoạn 2: Tạo Data Transfer Objects (DTO) & Guard bảo mật nội bộ
- [x] Tạo Guard bảo mật nội bộ [src/common/guards/internal-api.guard.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/guards/internal-api.guard.ts):
  - Kiểm tra header `x-internal-api-key` so với biến môi trường `INTERNAL_API_SECRET` để chỉ cho phép Lambda Worker gọi callback.
- [x] Tạo các DTO truy vấn & input:
  - [src/modules/notification/dto/get-notifications-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/dto/get-notifications-query.dto.ts): Kế thừa `PaginationQueryDto`, hỗ trợ `unreadOnly`, `status`.
  - [src/modules/notification/dto/get-scheduled-notifications-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/dto/get-scheduled-notifications-query.dto.ts).
  - [src/modules/notification/dto/create-scheduled-notification.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/dto/create-scheduled-notification.dto.ts): Validate `scheduledAt` tối thiểu 5 phút trong tương lai, validate `targetUserIds` bắt buộc khi `SELECTED_FRIENDS`.
  - [src/modules/notification/dto/notify-completed.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/dto/notify-completed.dto.ts): Nhận kết quả từ Lambda (`notificationId`, `scheduleId`, `status: COMPLETED | FAILED`, `deliveredVia`, `totalRecipients`, `sentAt`, `errorMessage`).
- [x] Tạo các DTO response:
  - [src/modules/notification/dto/notification-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/dto/notification-response.dto.ts).
  - [src/modules/notification/dto/scheduled-notification-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/dto/scheduled-notification-response.dto.ts).

---

### Giai đoạn 3: Xây dựng Repositories
- [x] Tạo [src/modules/notification/repositories/notification.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/repositories/notification.repository.ts):
  - Kế thừa `BaseRepository<Notification>`.
  - Cài đặt `findNotificationsWithPagination(recipientId, query)` kèm đếm tổng `unreadCount`.
  - Cài đặt `markAsRead(id, recipientId)` và `markAllAsRead(recipientId)`.
  - Cài đặt `updateDeliveryStatus(id, status, sentAt, errorMessage)`.
- [x] Tạo [src/modules/notification/repositories/scheduled-notification.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/repositories/scheduled-notification.repository.ts):
  - Kế thừa `BaseRepository<ScheduledNotification>`.
  - Cài đặt `findUserSchedules(userId, query)`.
  - Cài đặt `updateScheduleStatus(id, status, sentAt, totalRecipients)`.

---

### Giai đoạn 4: Xây dựng Services nghiệp vụ
- [x] Tạo [src/modules/notification/services/sqs-producer.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/services/sqs-producer.service.ts):
  - Khởi tạo `SQSClient` từ `@aws-sdk/client-sqs`.
  - Cài đặt hàm `pushToQueue(payload)` đẩy message vào SQS Queue với UUID EventId.
- [x] Tạo [src/modules/notification/services/notification.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/services/notification.service.ts):
  - `triggerNotification(input)`: Tạo bản ghi `status: PENDING` trong PostgreSQL -> Đẩy job vào SQS Queue -> Trả kết quả ngay lập tức (Decoupled, Async).
  - `markNotificationCompleted(dto)`: Xử lý idempotent callback từ Lambda Worker, cập nhật `COMPLETED` / `FAILED` và `sent_at`.
  - `getNotifications(recipientId, query)`.
  - `markAsRead(id, recipientId)` & `markAllAsRead(recipientId)`.
- [x] Tạo [src/modules/notification/services/scheduled-notification.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/services/scheduled-notification.service.ts):
  - `createSchedule(userId, dto)`: Lưu bản ghi `PENDING` -> Tạo EventBridge One-Time Schedule bắn vào SQS -> Lưu `schedulerArn`.
  - `listSchedules(userId, query)`.
  - `cancelSchedule(userId, scheduleId)`: Hủy EventBridge Schedule và đổi trạng thái `CANCELLED`.
  - `completeSchedule(dto)`: Cập nhật trạng thái hoàn thành gửi thông báo lập lịch.

---

### Giai đoạn 5: Controller & Khai báo Module
- [x] Tạo [src/modules/notification/notification.controller.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/notification.controller.ts):
  - `GET /api/v1/notifications` (JwtAuthGuard)
  - `PATCH /api/v1/notifications/:id/read` (JwtAuthGuard)
  - `PATCH /api/v1/notifications/read-all` (JwtAuthGuard)
  - `POST /api/v1/notifications/notify-completed` (InternalApiGuard - Webhook callback cho Lambda)
  - `POST /api/v1/notifications/schedules` (JwtAuthGuard)
  - `GET /api/v1/notifications/schedules` (JwtAuthGuard)
  - `DELETE /api/v1/notifications/schedules/:id` (JwtAuthGuard)
- [x] Tạo [src/modules/notification/notification.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/notification/notification.module.ts) và import vào [src/app.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/app.module.ts).

---

### Giai đoạn 6: Triển khai các Lambda Handlers (`infra/lambda-handler/`)
- [x] Tạo các tiện ích dùng chung:
  - [infra/lambda-handler/utils/redis.util.ts](file:///Users/macos/project/personal/aws/social/social-api/infra/lambda-handler/utils/redis.util.ts): Khởi tạo Redis client Singleton ngoài handler scope.
  - [infra/lambda-handler/utils/jwt-verifier.util.ts](file:///Users/macos/project/personal/aws/social/social-api/infra/lambda-handler/utils/jwt-verifier.util.ts): Xác thực token JWT.
- [x] Tạo các WebSocket Route Handlers:
  - [infra/lambda-handler/websocket/connect.ts](file:///Users/macos/project/personal/aws/social/social-api/infra/lambda-handler/websocket/connect.ts): Xác thực token, lưu `ws:user:{userId}:connections` và `ws:conn:{id}:user`.
  - [infra/lambda-handler/websocket/disconnect.ts](file:///Users/macos/project/personal/aws/social/social-api/infra/lambda-handler/websocket/disconnect.ts): Xóa connection khi client ngắt kết nối.
  - [infra/lambda-handler/websocket/default.ts](file:///Users/macos/project/personal/aws/social/social-api/infra/lambda-handler/websocket/default.ts): Phản hồi `ping` -> `pong` keep-alive.
- [x] Tạo các SQS Background Handlers:
  - [infra/lambda-handler/notification/consumer.ts](file:///Users/macos/project/personal/aws/social/social-api/infra/lambda-handler/notification/consumer.ts):
    - Hỗ trợ Partial Batch Failure Reporting (`SQSBatchResponse`, `batchItemFailures`).
    - Tra cứu Redis, gửi frame qua `ApiGatewayManagementApiClient.postToConnection()`.
    - Dọn dẹp connectionId stale khi bắt `GoneException`.
    - Fan-out theo batch 50 bạn bè đối với lịch hẹn.
    - Gọi API callback `POST /api/v1/notifications/notify-completed` kèm header `x-internal-api-key`.
  - [infra/lambda-handler/notification/dlq-consumer.ts](file:///Users/macos/project/personal/aws/social/social-api/infra/lambda-handler/notification/dlq-consumer.ts):
    - Kích hoạt khi có message lỗi quá 3 lần retry.
    - Gọi API callback cập nhật trạng thái `FAILED` kèm `errorMessage`.

---

### Giai đoạn 7: Cấu hình Hạ tầng SST & Kiểm thử tự động
- [x] Cập nhật [sst.config.ts](file:///Users/macos/project/personal/aws/social/social-api/sst.config.ts):
  - Khai báo routes `$connect`, `$disconnect`, `$default` cho `NotificationWebSocket`.
  - Khai báo `NotificationDLQ` và subscription `dlq-consumer.handler`.
  - Khai báo `NotificationQueue` với `reportBatchItemFailures: true` và subscription `consumer.handler`.
- [x] Viết Unit Tests & Integration Tests:
  - Unit test cho `NotificationService` (trigger SQS, mark completed, idempotent).
  - Unit test cho `InternalApiGuard` (xác thực header).
- [x] Chạy kiểm tra build và TypeScript types: `npm run build` & `npx tsc --noEmit` đạt 100% không lỗi.
