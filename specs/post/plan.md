# Kế hoạch phát triển (Implementation Plan): Module Post (Quản lý Bài viết & Tương tác)

Tài liệu kế hoạch phát triển cho module **Post** dựa trên [detail-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/post/detail-design.md) và [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/post/basic-design.md) theo quy chuẩn [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md).

---

## 1. Cấu trúc thư mục áp dụng

```text
src/
├── database/
│   └── entities/
│       ├── post.entity.ts                     # Entity Post kế thừa BaseEntity
│       ├── post-media.entity.ts               # Entity PostMedia lưu tệp S3 đính kèm
│       └── post-like.entity.ts                # Entity PostLike lưu tương tác thích bài viết
├── common/
│   ├── constants/
│   │   └── module.constant.ts                 # Bổ sung hằng số TABLE_NAMES cho post, media, likes
│   ├── decorators/
│   │   └── current-user.decorator.ts          # @CurrentUser() đã có sẵn
│   └── repositories/
│       └── base.repository.ts                 # BaseRepository dùng chung cho toàn bộ module
├── integrations/
│   └── storage/
│       ├── s3.service.ts                      # Đã có - cung cấp Presigned URL S3
│       └── storage.module.ts                  # StorageModule
├── modules/
│   └── post/
│       ├── post.controller.ts                 # API Controller /api/v1/posts
│       ├── post.module.ts                     # Khai báo PostModule
│       ├── services/
│       │   ├── post.service.ts                # Nghiệp vụ tạo, sửa, xóa, news feed, detail
│       │   └── post-like.service.ts           # Nghiệp vụ Like/Unlike bài viết & atomic counter
│       ├── repositories/
│       │   ├── post.repository.ts             # Kế thừa BaseRepository<Post>
│       │   ├── post-media.repository.ts       # Kế thừa BaseRepository<PostMedia>
│       │   └── post-like.repository.ts        # Kế thừa BaseRepository<PostLike>
│       └── dto/
│           ├── get-post-upload-url.dto.ts     # DTO yêu cầu presigned URL cho media
│           ├── upload-post-media-response.dto.ts
│           ├── create-post-media.dto.ts       # DTO media item đính kèm bài viết
│           ├── create-post.dto.ts             # DTO tạo bài viết mới
│           ├── update-post.dto.ts             # DTO cập nhật nội dung & privacy
│           ├── get-feed-query.dto.ts          # DTO cursor query cho News Feed
│           ├── post-response.dto.ts           # DTO trả về dữ liệu Post và Feed
│           └── toggle-like-response.dto.ts    # DTO kết quả toggle like
```

---

## 2. Kế hoạch triển khai từng bước

### Giai đoạn 1: Chuẩn bị Constants & Cấu trúc Database Entity
- [x] Cập nhật [src/common/constants/module.constant.ts](file:///Users/macos/project/personal/aws/social/social-api/src/common/constants/module.constant.ts) để thêm tên bảng: `POSTS`, `POST_MEDIA`, `POST_LIKES`.
- [x] Tạo entity `Post` tại [src/database/entities/post.entity.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/entities/post.entity.ts) kế thừa `BaseEntity`, khai báo các Enums `PostPrivacy`, `PostStatus`.
- [x] Tạo entity `PostMedia` tại [src/database/entities/post-media.entity.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/entities/post-media.entity.ts) lưu metadata S3 (mediaType, s3Key, url, thumbnailUrl, width, height, orderIndex).
- [x] Tạo entity `PostLike` tại [src/database/entities/post-like.entity.ts](file:///Users/macos/project/personal/aws/social/social-api/src/database/entities/post-like.entity.ts) với Unique Composite Index `(postId, userId)`.

### Giai đoạn 2: Tạo Data Transfer Objects (DTO) & Validation
- [x] Tạo [get-post-upload-url.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/get-post-upload-url.dto.ts) & [upload-post-media-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/upload-post-media-response.dto.ts).
- [x] Tạo [create-post-media.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/create-post-media.dto.ts) và [create-post.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/create-post.dto.ts).
- [x] Tạo [update-post.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/update-post.dto.ts).
- [x] Tạo [get-feed-query.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/get-feed-query.dto.ts) cho phân trang cursor.
- [x] Tạo [post-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/post-response.dto.ts) và [toggle-like-response.dto.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/dto/toggle-like-response.dto.ts).

### Giai đoạn 3: Xây dựng Repositories kế thừa BaseRepository
- [x] Tạo `PostRepository` tại [src/modules/post/repositories/post.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/repositories/post.repository.ts) kế thừa `BaseRepository<Post>`:
  - Cài đặt phương thức `findNewsFeed` với thuật toán Cursor `(createdAt, id)` và lọc điều kiện privacy (`PUBLIC`, `FRIENDS`, bài viết của chính người xem).
  - Cài đặt phương thức `findPostByIdWithDetails` join sẵn `User` và `PostMedia`.
  - Cài đặt phương thức `findUserTimeline` phục vụ xem trang cá nhân.
- [x] Tạo `PostMediaRepository` tại [src/modules/post/repositories/post-media.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/repositories/post-media.repository.ts) kế thừa `BaseRepository<PostMedia>`.
- [x] Tạo `PostLikeRepository` tại [src/modules/post/repositories/post-like.repository.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/repositories/post-like.repository.ts) kế thừa `BaseRepository<PostLike>` kèm hàm kiểm tra tập hợp `getLikedPostIds`.

### Giai đoạn 4: Xây dựng Business Services & S3 Presigned URL Integration
- [x] Tạo `PostService` tại [src/modules/post/services/post.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/services/post.service.ts) kế thừa `BaseService<Post, PostRepository>`:
  - Tích hợp `S3Service.getPresignedPutUrl` với prefix cô lập `posts/{userId}/{timestamp}-{uuid}-{filename}`.
  - Xử lý `createPost` trong Transaction (lưu Post và mảng PostMedia).
  - Xử lý `getNewsFeed` giải mã/mã hóa cursor Base64, đối soát trạng thái `isLiked`.
  - Xử lý `getPostById` kiểm tra quyền riêng tư (chính chủ, công khai, bạn bè).
  - Xử lý `updatePost` & `deletePost` (Soft Delete) kiểm tra quyền tác giả.
- [x] Tạo `PostLikeService` tại [src/modules/post/services/post-like.service.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/services/post-like.service.ts):
  - Xử lý `toggleLike` trong Database Transaction, cập nhật atomic counter `likes_count` tránh race condition.

### Giai đoạn 5: Xây dựng Controller & API Endpoints
- [x] Tạo `PostController` tại [src/modules/post/post.controller.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/post.controller.ts) với tiền tố `/api/v1/posts`:
  - `POST /posts/media/upload-url`: Xin URL tải ảnh/video trực tiếp lên S3.
  - `POST /posts`: Tạo bài viết mới.
  - `GET /posts/feed`: Lấy News Feed theo cursor pagination.
  - `GET /posts/:id`: Xem chi tiết bài viết (ParseUUIDPipe).
  - `PATCH /posts/:id`: Cập nhật nội dung & privacy.
  - `DELETE /posts/:id`: Xóa bài viết.
  - `POST /posts/:id/like`: Bật/Tắt thích bài viết.

### Giai đoạn 6: Cấu hình Module & Tích hợp AppModule
- [x] Tạo `PostModule` tại [src/modules/post/post.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/modules/post/post.module.ts) import `TypeOrmModule.forFeature([Post, PostMedia, PostLike])` và `StorageModule`.
- [x] Đăng ký `PostModule` vào [src/app.module.ts](file:///Users/macos/project/personal/aws/social/social-api/src/app.module.ts).

### Giai đoạn 7: Kiểm thử & Đảm bảo chất lượng
- [x] Kiểm tra biên dịch TypeScript `npm run build`.
- [x] Kiểm tra chuẩn code & formatting `npm run lint`.
- [x] Viết unit test cho `PostService` và `PostLikeService` theo ma trận test case trong `detail-design.md`.
