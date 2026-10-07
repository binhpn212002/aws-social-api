# Kế hoạch phát triển (Implementation Plan): Module Chat (Amazon DynamoDB 2-Table, AWS S3, AWS WebSocket & Hybrid PostgreSQL Mapping)

Tài liệu kế hoạch phát triển cho module **Chat** dựa trên [detail-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/chat/detail-design.md) và [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/chat/basic-design.md), tuân thủ các nguyên tắc tại [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md) và [implement.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/implement.promt.md).

Hệ thống lưu trữ dữ liệu trò chuyện trên **2 bảng Amazon DynamoDB chuyên biệt**:
- `ChatConversations` (`social-chat-conversations`): Lưu trữ cuộc hội thoại với danh sách thành viên là một mảng `memberIds: string[]`.
- `ChatMessages` (`social-chat-messages`): Lưu trữ lịch sử tin nhắn với trường `userId` người gửi.
- **Chiến lược Hybrid Query**: Đọc dữ liệu chat từ DynamoDB, gom tập hợp các `userId`, sau đó truy vấn sang **PostgreSQL** (bảng `users`) kết hợp bộ nhớ đệm **Redis** để lấy thông tin hồ sơ và thực hiện in-memory mapping trước khi trả về API response.

---

## 1. Cấu trúc file & thư mục áp dụng

```text
src/
├── common/
│   ├── constants/
│   │   └── module.constant.ts                  # Khai báo tên bảng DynamoDB Chat, WS Actions, S3 prefix
│   ├── decorators/
│   │   └── current-user.decorator.ts           # Đã có - trích xuất user từ JWT Request
│   └── guards/
│       └── jwt-auth.guard.ts                   # Đã có - xác thực JWT Bearer
├── config/
│   └── aws.config.ts                           # Bổ sung cấu hình tên 2 bảng DynamoDB Chat
├── integrations/
│   ├── redis/
│   │   └── redis.service.ts                    # Đã có - dùng để quản lý connectionId của WebSocket clients
│   └── storage/
│       └── s3.service.ts                       # Đã có - dùng để sinh Presigned URL tải file lên/xuống
├── modules/
│   ├── user/
│   │   └── services/user.service.ts            # Cung cấp / bổ sung method getUsersByIds() phục vụ Hybrid Mapping
│   └── chat/
│       ├── chat.controller.ts                  # REST API Controller (/api/v1/chat/*)
│       ├── chat.module.ts                      # Khai báo module Chat, providers, controllers
│       ├── services/
│       │   ├── chat.service.ts                 # Nghiệp vụ hội thoại, tin nhắn & Hybrid Mapping Postgres
│       │   ├── chat-ws.service.ts              # Quản lý WebSocket connection qua Redis & push message
│       │   └── chat-media.service.ts           # Xử lý xin S3 Presigned URL & kiểm tra định dạng media
│       ├── repositories/
│       │   ├── chat-conversation.repository.ts # Thao tác CRUD/Query bảng ChatConversations (DynamoDB)
│       │   └── chat-message.repository.ts      # Thao tác CRUD/Query/Transact bảng ChatMessages (DynamoDB)
│       ├── interfaces/
│       │   ├── chat-conversation.interface.ts  # TypeScript Interface cho bảng ChatConversations
│       │   ├── chat-message.interface.ts       # TypeScript Interface cho bảng ChatMessages
│       │   └── chat-ws.interface.ts            # Định dạng Frame gửi/nhận WebSocket
│       └── dto/
│           ├── create-conversation.dto.ts      # DTO tạo cuộc trò chuyện (DIRECT / GROUP)
│           ├── get-conversations-query.dto.ts  # DTO phân trang lấy danh sách hội thoại
│           ├── get-messages-query.dto.ts       # DTO phân trang lấy tin nhắn (Cursor-based)
│           ├── send-message.dto.ts             # DTO gửi tin nhắn mới
│           ├── upload-media-url.dto.ts         # DTO xin S3 Presigned URL
│           ├── mark-as-read.dto.ts             # DTO đánh dấu đã đọc
│           ├── conversation-response.dto.ts    # DTO Response hội thoại sau mapping PostgreSQL
│           └── chat-message-response.dto.ts    # DTO Response tin nhắn sau mapping PostgreSQL
```

---

## 2. Kế hoạch triển khai từng bước (Phase-by-Phase)

### Giai đoạn 1: Cấu hình Hệ thống, Constants & TypeScript Interfaces
- [x] **1.1. Cập nhật cấu hình AWS DynamoDB**:
  - File: [src/config/aws.config.ts](file:///Users/macos/project/personal/aws/social/social-api/src/config/aws.config.ts)
  - Bổ sung cấu hình:
    - `chatConversationsTableName`: `process.env.AWS_DYNAMODB_CHAT_CONVERSATIONS_TABLE_NAME || 'social-chat-conversations'`
    - `chatMessagesTableName`: `process.env.AWS_DYNAMODB_CHAT_MESSAGES_TABLE_NAME || 'social-chat-messages'`
- [x] **1.2. Bổ sung Constants trong Module Constant**:
  - File: [src/common/constants/module.constant.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/constants/module.constant.ts)
  - Khai báo hằng số tên bảng DynamoDB: `DYNAMODB_TABLES.CHAT_CONVERSATIONS`, `DYNAMODB_TABLES.CHAT_MESSAGES`.
  - Khai báo các hằng số liên quan WebSocket Actions (`sendMessage`, `typing`, `markAsRead`) và Events (`message:new`, `user:typing`, `conversation:read`).
  - Khai báo giới hạn kích thước file upload (`CHAT_MEDIA_LIMITS`: Image 10MB, Video 50MB, Audio 15MB, File 25MB).
- [x] **1.3. Khai báo TypeScript Interfaces & Enums**:
  - File: `src/modules/chat/interfaces/chat-conversation.interface.ts`
    - Enum `ConversationType` (`DIRECT`, `GROUP`).
    - Interface `DynamoChatConversation`: `id`, `type`, `name`, `avatarUrl`, `memberIds: string[]`, `lastMessage`, `lastMessageAt`, `unreadCounts`, `createdBy`, `createdAt`, `updatedAt`.
  - File: `src/modules/chat/interfaces/chat-message.interface.ts`
    - Enum `MessageType` (`TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `FILE`).
    - Interface `DynamoChatMessage`: `conversationId`, `sk`, `id`, `userId`, `type`, `content`, `mediaUrl`, `s3Key`, `fileName`, `fileSize`, `replyToId`, `isRecalled`, `createdAt`, `ttl`.
  - File: `src/modules/chat/interfaces/chat-ws.interface.ts`
    - Định nghĩa cấu trúc khung truyền nhận qua WebSocket: `WsActionFrame`, `WsEventBroadcast`.

---

### Giai đoạn 2: Xây dựng Data Transfer Objects (DTO)
- [x] **2.1. Request DTOs**:
  - File: `src/modules/chat/dto/create-conversation.dto.ts`
    - `type`: Enum `ConversationType` (`DIRECT` / `GROUP`), bắt buộc.
    - `recipientId`: UUID v4, bắt buộc khi `type = DIRECT`.
    - `name`: Chuỗi, bắt buộc khi `type = GROUP` (tối đa 100 ký tự).
    - `avatarUrl`: URL hợp lệ, tùy chọn khi `type = GROUP`.
    - `memberIds`: Mảng UUID v4, bắt buộc khi `type = GROUP` (tối thiểu 1 người ngoài người tạo, tối đa 500).
  - File: `src/modules/chat/dto/send-message.dto.ts`
    - `conversationId`: UUID v4, bắt buộc.
    - `type`: Enum `MessageType` (`TEXT`, `IMAGE`, `VIDEO`, `AUDIO`, `FILE`), mặc định `TEXT`.
    - `content`: Chuỗi văn bản, tối đa 5000 ký tự (bắt buộc nếu `type = TEXT`).
    - `mediaUrl`, `s3Key`, `fileName`, `fileSize`: Các thông tin đính kèm media.
    - `replyToId`: UUID v4 của tin nhắn muốn trả lời, tùy chọn.
  - File: `src/modules/chat/dto/get-conversations-query.dto.ts`
    - `limit`: Số lượng bản ghi (1 - 50, mặc định 20).
    - `cursor`: Chuỗi cursor phân trang.
  - File: `src/modules/chat/dto/get-messages-query.dto.ts`
    - `limit`: Số tin nhắn lấy (1 - 100, mặc định 30).
    - `cursor`: Chuỗi cursor phân trang mã hóa Base64 từ DynamoDB `LastEvaluatedKey`.
  - File: `src/modules/chat/dto/upload-media-url.dto.ts`
    - `conversationId`: UUID v4, bắt buộc.
    - `fileName`: Chuỗi tên file hợp lệ.
    - `contentType`: MIME type hợp lệ (`image/jpeg`, `image/png`, `video/mp4`, v.v.).
    - `fileSize`: Dung lượng byte hợp lệ theo giới hạn từng loại media.
  - File: `src/modules/chat/dto/mark-as-read.dto.ts`
    - `conversationId`: UUID v4, bắt buộc.
- [x] **2.2. Response DTOs**:
  - File: `src/modules/chat/dto/conversation-response.dto.ts`
    - `UserProfileDto`: `{ id, username, fullName, avatarUrl, status }`.
    - `ConversationResponseDto`: `{ id, type, name, avatarUrl, members, lastMessage, unreadCount, createdAt, updatedAt }`.
  - File: `src/modules/chat/dto/chat-message-response.dto.ts`
    - `ChatMessageResponseDto`: `{ id, conversationId, type, content, mediaUrl, fileName, fileSize, replyToId, isRecalled, createdAt, sender: UserProfileDto }`.

---

### Giai đoạn 3: Xây dựng Tầng Repositories Amazon DynamoDB
- [x] **3.1. `ChatConversationRepository`**:
  - File: `src/modules/chat/repositories/chat-conversation.repository.ts`
  - Khởi tạo `DynamoDBClient` và `DynamoDBDocumentClient` từ cấu hình AWS.
  - Cài đặt `findById(id: string)`: `GetCommand` O(1) < 5ms.
  - Cài đặt `create(conversation: DynamoChatConversation)`: `PutCommand`.
  - Cài đặt `findByMemberId(userId: string, limit: number)`:
    - Quét/Lọc với `FilterExpression: contains(memberIds, :userId)`.
    - Sắp xếp in-memory theo `lastMessageAt DESC`.
  - Cài đặt `findDirectConversation(userAId: string, userBId: string)`:
    - Tìm kiếm xem cuộc hội thoại `DIRECT` giữa 2 người này đã tồn tại hay chưa để tránh trùng lặp.
  - Cài đặt `resetUnreadCount(conversationId: string, userId: string)`:
    - `UpdateCommand` đặt `unreadCounts.#userId = 0`.
- [x] **3.2. `ChatMessageRepository`**:
  - File: `src/modules/chat/repositories/chat-message.repository.ts`
  - Cài đặt `findByConversationId(conversationId: string, limit: number, cursor?: string)`:
    - `QueryCommand` với `KeyConditionExpression: 'conversationId = :cid'`.
    - `ScanIndexForward: false` (lấy tin mới nhất trước).
    - Giải mã cursor Base64 thành `ExclusiveStartKey` và mã hóa `LastEvaluatedKey` thành `nextCursor`.
  - Cài đặt `saveMessageWithConversationUpdate(message: DynamoChatMessage, otherMemberIds: string[])`:
    - Dùng **`TransactWriteCommand`** nguyên tử:
      1. `Put`: Thêm tin nhắn mới vào bảng `ChatMessages`.
      2. `Update`: Cập nhật `lastMessage`, `lastMessageAt`, `updatedAt` và tăng giá trị `unreadCounts.#recipientId = if_not_exists(...) + 1` cho các thành viên khác trong `ChatConversations`.
  - Cài đặt `recallMessage(conversationId: string, sk: string)`:
    - `UpdateCommand` đặt `isRecalled = true`, xóa nội dung/mediaUrl nếu có.

---

### Giai đoạn 4: Xây dựng Tầng Dịch vụ (Services) & Xử lý Hybrid Mapping
- [x] **4.1. `ChatMediaService`**:
  - File: `src/modules/chat/services/chat-media.service.ts`
  - Kiểm tra MIME type và dung lượng file hợp lệ.
  - Gọi `S3Service.getSignedUrl('putObject', ...)` tạo Presigned PUT URL có thời hạn 15 phút (`expiresIn: 900`).
  - Định dạng key S3: `chat/{conversationId}/{uuid}-{fileName}`.
- [x] **4.2. `ChatWsService`**:
  - File: `src/modules/chat/services/chat-ws.service.ts`
  - Tích hợp `RedisService` để quản lý `connectionId` của user:
    - Lưu danh sách kết nối vào Redis Set `ws:chat:user:{userId}`.
    - Xóa `connectionId` khi disconnect.
  - Tích hợp `ApiGatewayManagementApiClient` của AWS SDK v3:
    - `broadcastToMembers(conversationId, memberIds, senderId, payload)`: Lấy các `connectionId` của các thành viên nhận từ Redis và gọi `postToConnection()`.
    - Tự động xóa `connectionId` khỏi Redis nếu nhận lỗi `GoneException (410)` (Dead connection).
- [x] **4.3. `ChatService`**:
  - File: `src/modules/chat/services/chat.service.ts`
  - Cài đặt cơ chế Caching User Profile:
    - `getUserProfileMap(userIds: string[])`: Kiểm tra profile trong Redis (`user:profile:{userId}`).
    - Với các ID chưa có trong Redis: Query PostgreSQL (`UserRepository.findMany` hoặc `UserService.getUsersByIds`), sau đó lưu vào Redis với TTL = 3600s.
  - Cài đặt nghiệp vụ `createConversation(currentUserId, dto)`:
    - Nếu là `DIRECT`: Kiểm tra xem đã có hội thoại giữa 2 người chưa; nếu có thì trả về hội thoại hiện tại; nếu chưa thì tạo mới với `memberIds: [currentUserId, recipientId]`.
    - Nếu là `GROUP`: Tạo mới với `memberIds = [currentUserId, ...dto.memberIds]`.
    - Mapping Profile trả về Response DTO hoàn chỉnh.
  - Cài đặt nghiệp vụ `getMyConversations(currentUserId, queryDto)`:
    - Đọc DynamoDB `ChatConversations` theo `memberIds contains currentUserId`.
    - Trích xuất tập hợp `userId` duy nhất từ `memberIds` và `lastMessage.userId`.
    - Lấy Profile từ Redis/PostgreSQL.
    - In-memory mapping: Xử lý tiêu đề/avatar cho hội thoại `DIRECT` (lấy theo đối phương), gắn Profile người gửi của `lastMessage`, lấy `unreadCount`.
  - Cài đặt nghiệp vụ `getConversationMessages(conversationId, currentUserId, queryDto)`:
    - Xác thực quyền thành viên: `conversation.memberIds.includes(currentUserId)`.
    - Đọc DynamoDB `ChatMessages`.
    - Lấy Profile người gửi từ PostgreSQL/Redis và mapping field `sender`.
  - Cài đặt nghiệp vụ `sendMessage(currentUserId, dto)`:
    - Kiểm tra quyền gửi trong cuộc hội thoại.
    - Thực thi `saveMessageWithConversationUpdate` nguyên tử.
    - Ghép profile người gửi và gọi `ChatWsService.broadcastToMembers()` đẩy realtime event `message:new`.
  - Cài đặt nghiệp vụ `markAsRead(conversationId, currentUserId)`:
    - Reset unread count trên DynamoDB.
    - Gửi WebSocket event `conversation:read` cho các thành viên khác.

---

### Giai đoạn 5: Xây dựng REST API Controller & Khai báo Module
- [x] **5.1. `ChatController`**:
  - File: `src/modules/chat/chat.controller.ts`
  - Áp dụng `@UseGuards(JwtAuthGuard)` và `@CurrentUser()` trên toàn bộ các endpoints.
  - Endpoints:
    - `POST /api/v1/chat/media/upload-url`: Xin Presigned URL upload media S3.
    - `POST /api/v1/chat/conversations`: Tạo cuộc hội thoại mới.
    - `GET /api/v1/chat/conversations`: Lấy danh sách hộp thư hội thoại.
    - `GET /api/v1/chat/conversations/:id/messages`: Lấy lịch sử tin nhắn trong cuộc hội thoại.
    - `PATCH /api/v1/chat/conversations/:id/read`: Đánh dấu đã đọc tin nhắn.
- [x] **5.2. `ChatModule` & Đăng ký Hệ thống**:
  - File: `src/modules/chat/chat.module.ts`
  - Khai báo Controller: `ChatController`.
  - Khai báo Providers: `ChatService`, `ChatWsService`, `ChatMediaService`, `ChatConversationRepository`, `ChatMessageRepository`.
  - Import các module phụ thuộc: `ConfigModule`, `RedisModule`, `StorageModule`, `UserModule`.
  - File: [src/app.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/app.module.ts):
    - Đăng ký `ChatModule` vào danh sách `imports` của `AppModule`.

---

### Giai đoạn 6: Kiểm thử, Tối ưu hóa & Bảo mật
- [x] **6.1. Kiểm tra Quyền truy cập & Bảo mật chống IDOR**:
  - Người dùng không thuộc `memberIds` cố tình gọi API lấy tin nhắn hoặc gửi tin nhắn phải nhận mã lỗi `403 Forbidden`.
  - Không thể đọc tin nhắn của cuộc trò chuyện riêng tư của người khác.
- [x] **6.2. Kiểm tra Tính toàn vẹn của Giao dịch DynamoDB TransactWrite**:
  - Đảm bảo khi gửi tin nhắn, cả tin nhắn mới và cập nhật hộp thư (`lastMessage`, `unreadCounts`) đều thành công đồng thời, không xảy ra tình trạng mất mát hoặc lệch dữ liệu.
- [x] **6.3. Kiểm tra Tốc độ Truy vấn Hybrid & In-Memory Mapping**:
  - Kiểm tra hiệu năng đọc kết hợp DynamoDB và PostgreSQL có đạt mục tiêu độ trễ < 50ms khi có cache Redis.
- [x] **6.4. Kiểm tra Realtime WebSocket & Xử lý Dead Connections**:
  - Kiểm tra việc đẩy tin nhắn tức thời tới các kết nối đang mở.
  - Kiểm tra khả năng tự động dọn dẹp các `connectionId` đã ngắt kết nối (HTTP 410) khỏi Redis.
- [x] **6.5. Kiểm tra Build & Lint**:
  - Chạy `npm run build` kiểm tra toàn bộ mã nguồn không có lỗi type hoặc lint.
