# Kế hoạch phát triển (Implementation Plan): Module Friend (Quản lý Bạn bè & Mối quan hệ)

Tài liệu kế hoạch phát triển cho module **Friend** dựa trên [detail-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/friend/detail-design.md) và [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/friend/basic-design.md) theo quy chuẩn [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md).

---

## 1. Cấu trúc thư mục áp dụng

```text
src/
├── database/
│   └── entities/
│       └── friendship.entity.ts               # Entity Friendship kế thừa BaseEntity
├── common/
│   ├── constants/
│   │   └── module.constant.ts                 # Đã có TABLE_NAMES.FRIENDSHIPS: 'friendships'
│   ├── decorators/
│   │   └── current-user.decorator.ts          # Decorator @CurrentUser('id') đã có sẵn
│   ├── guards/
│   │   └── jwt-auth.guard.ts                  # JwtAuthGuard bảo vệ API endpoints
│   └── repositories/
│       └── base.repository.ts                 # BaseRepository dùng chung cho toàn bộ module
├── modules/
│   └── friend/
│       ├── friend.controller.ts               # API Controller /api/v1/friends
│       ├── friend.module.ts                   # Khai báo FriendModule
│       ├── services/
│       │   └── friend.service.ts              # Nghiệp vụ kết bạn, chấp nhận, từ chối, hủy, chặn, danh bạ
│       ├── repositories/
│       │   └── friendship.repository.ts       # Kế thừa BaseRepository<Friendship>
│       └── dto/
│           ├── send-friend-request.dto.ts     # DTO gửi lời mời kết bạn (addresseeId)
│           ├── get-friends-query.dto.ts       # DTO phân trang & tìm kiếm danh sách bạn bè
│           ├── get-friend-requests-query.dto.ts # DTO lấy danh sách lời mời (type: received | sent)
│           ├── get-blocked-users-query.dto.ts # DTO phân trang danh sách người dùng bị chặn
│           ├── friendship-response.dto.ts     # DTO chi tiết bản ghi friendship
│           ├── friend-user-response.dto.ts    # DTO thông tin bạn bè kèm thời điểm kết bạn
│           └── friendship-status-response.dto.ts # DTO kiểm tra trạng thái tương tác giữa 2 người dùng
```

---

## 2. Kế hoạch triển khai từng bước

### Giai đoạn 1: Chuẩn bị Constants & Cấu trúc Database Entity
- [x] Kiểm tra hằng số `TABLE_NAMES.FRIENDSHIPS = 'friendships'` trong [src/common/constants/module.constant.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/constants/module.constant.ts).
- [x] Tạo entity `Friendship` tại [src/database/entities/friendship.entity.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/entities/friendship.entity.ts) kế thừa `BaseEntity`:
  - Khai báo Enums `FriendshipStatus` (`PENDING`, `ACCEPTED`, `DECLINED`, `BLOCKED`) và `FriendRequestType` (`received`, `sent`).
  - Cấu hình khóa ngoại liên kết tới `User` (`requester_id`, `addressee_id`) với hành vi `onDelete: 'CASCADE'`.
  - Cấu hình ràng buộc duy nhất `@Unique('uq_friendships_requester_addressee', ['requesterId', 'addresseeId'])`.
  - Cấu hình ràng buộc kiểm tra `@Check('chk_friendships_no_self_friend', '"requester_id" <> "addressee_id"')`.
  - Đánh chỉ mục tối ưu truy vấn: `idx_friendships_requester_status`, `idx_friendships_addressee_status`, `idx_friendships_status_created`.

### Giai đoạn 2: Tạo Data Transfer Objects (DTO) & Validation
- [x] Tạo [src/modules/friend/dto/send-friend-request.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/dto/send-friend-request.dto.ts) validate `addresseeId` (UUID v4, bắt buộc).
- [x] Tạo [src/modules/friend/dto/get-friends-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/dto/get-friends-query.dto.ts) hỗ trợ `page`, `limit` (max 100), `search`, `sortBy`, `sortDir`.
- [x] Tạo [src/modules/friend/dto/get-friend-requests-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/dto/get-friend-requests-query.dto.ts) hỗ trợ enum `type` (`received` hoặc `sent`) và phân trang.
- [x] Tạo [src/modules/friend/dto/get-blocked-users-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/dto/get-blocked-users-query.dto.ts) hỗ trợ phân trang danh sách bị chặn.
- [x] Tạo [src/modules/friend/dto/friend-user-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/dto/friend-user-response.dto.ts) định nghĩa `FriendUserItemDto` và `FriendListResponseDto`.
- [x] Tạo [src/modules/friend/dto/friendship-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/dto/friendship-response.dto.ts) định nghĩa `FriendshipResponseDto` và `FriendRequestListResponseDto`.
- [x] Tạo [src/modules/friend/dto/friendship-status-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/dto/friendship-status-response.dto.ts) định nghĩa `FriendshipStatusResponseDto` (phục vụ Profile Page và Chat).

### Giai đoạn 3: Xây dựng Repositories kế thừa BaseRepository
- [x] Tạo `FriendshipRepository` tại [src/modules/friend/repositories/friendship.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/repositories/friendship.repository.ts) kế thừa [BaseRepository<Friendship>](file:///Users/macos/project/personal/aws/social/social-api/src/common/repositories/base.repository.ts):
  - Cài đặt `findRelationshipBetween(user1Id, user2Id)` kiểm tra quan hệ hai chiều đối xứng.
  - Cài đặt `findPendingRequest(requesterId, addresseeId)` tìm lời mời đang chờ phản hồi.
  - Cài đặt `areFriends(user1Id, user2Id)` kiểm tra nhanh 2 người có phải bạn bè không.
  - Cài đặt `isBlockedBetween(user1Id, user2Id)` kiểm tra trạng thái chặn giữa 2 người.
  - Cài đặt `getAllFriendUserIds(userId)` lấy mảng ID bạn bè (cung cấp cho News Feed và Scheduled Notification).
  - Cài đặt `getFriendsPaginated(userId, query)` sử dụng QueryBuilder với `INNER JOIN users u ON u.id = CASE WHEN f.requester_id = :userId THEN f.addressee_id ELSE f.requester_id END` kèm tìm kiếm theo họ tên/username và phân trang.
  - Cài đặt `getFriendRequestsPaginated(userId, query)` phân luồng lời mời nhận được (`received`) hoặc đã gửi (`sent`).
  - Cài đặt `getBlockedUsersPaginated(userId, query)` lấy danh sách người dùng bị chặn bởi `userId`.

### Giai đoạn 4: Xây dựng Business Services & Logic Xử lý Mối quan hệ
- [x] Tạo `FriendService` tại [src/modules/friend/services/friend.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/services/friend.service.ts):
  - `sendFriendRequest`: Ngăn chặn tự kết bạn, kiểm tra tồn tại user, kiểm tra trạng thái chặn (403), chống trùng lặp lời mời (400/409), tự động chấp nhận (auto-accept) nếu đối phương đã gửi lời mời trước đó, phát event notification `FRIEND_REQUEST`.
  - `acceptFriendRequest`: Kiểm tra người nhận hợp lệ, trạng thái `PENDING`, cập nhật `ACCEPTED`, phát event notification `FRIEND_ACCEPTED`.
  - `declineFriendRequest`: Cập nhật trạng thái `DECLINED`.
  - `cancelFriendRequest`: Cho phép người gửi hủy lời mời `PENDING`.
  - `unfriend`: Xóa bản ghi kết bạn hai chiều khi đang `ACCEPTED`.
  - `blockUser`: Chặn người dùng, ghi đè mọi quan hệ hiện tại thành `BLOCKED` với `requesterId = blockerId`.
  - `unblockUser`: Xóa bản ghi `BLOCKED` để mở lại tương tác bình thường.
  - `getFriends`: Trả về danh sách bạn bè kèm thông tin user và phân trang.
  - `getFriendRequests`: Lấy danh sách lời mời `received` hoặc `sent`.
  - `getBlockedUsers`: Lấy danh sách tài khoản bị chặn.
  - `getFriendshipStatus`: Trả về trạng thái chi tiết giữa 2 người dùng (`isFriend`, `status`, `direction`, `isBlockedByMe`, `isBlockedByThem`).
  - `getAllFriendIds`: Cung cấp danh sách ID bạn bè cho các module khác.

### Giai đoạn 5: Xây dựng Controller & API Endpoints
- [x] Tạo `FriendController` tại [src/modules/friend/friend.controller.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/friend.controller.ts) gắn tiền tố `/api/v1/friends`:
  - `POST   /api/v1/friends/requests`: Gửi lời mời kết bạn (201 Created).
  - `PATCH  /api/v1/friends/requests/:id/accept`: Chấp nhận lời mời (200 OK).
  - `PATCH  /api/v1/friends/requests/:id/decline`: Từ chối lời mời (200 OK).
  - `DELETE /api/v1/friends/requests/:id/cancel`: Hủy lời mời đã gửi (200 OK).
  - `DELETE /api/v1/friends/:friendUserId`: Hủy kết bạn (200 OK).
  - `GET    /api/v1/friends`: Lấy danh sách bạn bè (200 OK).
  - `GET    /api/v1/friends/requests`: Lấy danh sách lời mời (200 OK).
  - `GET    /api/v1/friends/status/:userId`: Lấy trạng thái quan hệ 2 người (200 OK).
  - `POST   /api/v1/friends/block/:userId`: Chặn người dùng (200 OK).
  - `DELETE /api/v1/friends/block/:userId`: Bỏ chặn người dùng (200 OK).
  - `GET    /api/v1/friends/blocks`: Lấy danh sách người dùng bị chặn (200 OK).

### Giai đoạn 6: Cấu hình Module & Tích hợp AppModule
- [x] Tạo `FriendModule` tại [src/modules/friend/friend.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/friend.module.ts):
  - Import `TypeOrmModule.forFeature([Friendship, User])`.
  - Đăng ký `FriendController`, `FriendService`, `FriendshipRepository`.
  - Export `FriendService` và `FriendshipRepository` để các module khác (Post, Notification, Chat) tái sử dụng.
- [x] Đăng ký `FriendModule` vào [src/app.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/app.module.ts).

### Giai đoạn 7: Tích hợp Liên Module (Cross-Module Integration)
- [x] Tích hợp với **Module Post**: Cung cấp hàm `FriendService.getAllFriendIds(authorId)` để kiểm tra quyền truy cập bảng tin cho bài viết có `privacy = 'FRIENDS'`.
- [x] Tích hợp với **Module Notification**: Cung cấp danh sách ID bạn bè làm nguồn đối tượng nhận tự động cho tính năng **Thông báo Lập lịch (Scheduled Notifications to Friends)**.

### Giai đoạn 8: Kiểm thử & Đảm bảo chất lượng (QA & Test)
- [x] Kiểm tra biên dịch TypeScript `npm run build`.
- [x] Kiểm tra chuẩn code & formatting `npm run lint`.
- [x] Viết unit test cho `FriendService` tại [src/modules/friend/services/friend.service.spec.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/friend/services/friend.service.spec.ts) bao phủ toàn bộ ma trận test cases.

---

## 3. Tổng kết Danh mục API Endpoints

| Phương thức | Đường dẫn API | Mô tả | Quyền truy cập |
| :--- | :--- | :--- | :---: |
| `POST` | `/api/v1/friends/requests` | Gửi lời mời kết bạn | Bearer JWT |
| `PATCH` | `/api/v1/friends/requests/:id/accept` | Chấp nhận lời mời kết bạn | Bearer JWT |
| `PATCH` | `/api/v1/friends/requests/:id/decline` | Từ chối lời mời kết bạn | Bearer JWT |
| `DELETE` | `/api/v1/friends/requests/:id/cancel` | Hủy lời mời kết bạn đã gửi | Bearer JWT |
| `DELETE` | `/api/v1/friends/:friendUserId` | Hủy kết bạn (Unfriend) | Bearer JWT |
| `GET` | `/api/v1/friends` | Lấy danh sách bạn bè (phân trang + tìm kiếm) | Bearer JWT |
| `GET` | `/api/v1/friends/requests` | Lấy danh sách lời mời (`type=received\|sent`) | Bearer JWT |
| `GET` | `/api/v1/friends/status/:userId` | Kiểm tra trạng thái quan hệ với 1 người dùng | Bearer JWT |
| `POST` | `/api/v1/friends/block/:userId` | Chặn người dùng | Bearer JWT |
| `DELETE` | `/api/v1/friends/block/:userId` | Bỏ chặn người dùng | Bearer JWT |
| `GET` | `/api/v1/friends/blocks` | Lấy danh sách người dùng đang bị chặn | Bearer JWT |
