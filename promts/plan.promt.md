
.
├── specs/
│   ├── moduleA/
│   │   ├── basic-design.md
│   │   └── detail-design.md
│   └── moduleB/
│       ├── basic-design.md
│       └── detail-design.md
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/            # Các thành phần dùng chung
│   │   ├── decorators/
│   │   ├── guards/
│   │   ├── filters/
│   │   ├── interceptors/
│   │   ├── utils/
│   │   ├── constants/
│   │   │   └── module.constant.ts   # <--- Thêm file constants/module.constant.ts cho các hằng số liên quan module (ví dụ: tên bảng, enum, v.v)
│   │   ├── exceptions/
│   │   └── repositories/  # Thư mục dùng để chứa baseRepository dùng chung cho cả dự án
│   ├── config/            # Cấu hình hệ thống & môi trường
│   │   ├── database.config.ts
│   │   └── app.config.ts
│   ├── database/          # Thiết lập Database
│   │   ├── typeorm.config.ts
│   │   ├── migrations/
│   │   ├── entities/
│   │   └── seeds/
│   ├── modules/           # 💡 Core business logic
│   │   ├── auth/
│   │   ├── user/
│   │   ├── role/
│   │   ├── product/
│   │   ├── supplier/
│   │   ├── warehouse/
│   │   ├── inventory/
│   │   ├── stock/
│   │   ├── purchase/      # Purchase order
│   │   ├── report/
│   │   └── settings/      # Master data
│   ├── integrations/      # Tích hợp dịch vụ bên ngoài
│   │   ├── redis/
│   │   ├── queue/
│   │   ├── storage/
│   │   └── webhook/
│   ├── jobs/              # Cron / background jobs
│   │   ├── low-stock.job.ts
│   │   └── report.job.ts
│   └── shared/            # Shared base module
│       ├── base.entity.ts
│       └── base.service.ts

Bước thực hiện khi nhận vào detail-design và tạo file plan.md trong thư mục specs/moduleA:

1. Xác định module: Ví dụ, với moduleA.
2. Trong thư mục specs/moduleA, tạo file mới có tên là plan.md để mô tả kế hoạch phát triển.
3. Cấu trúc thư mục nên được tạo cho moduleA bên trong src/modules/moduleA với các thành phần cơ bản như sau:
4. Thêm thư mục entity trong src/database/entities để chứa các entity (ORM models) liên quan.
5. Đối với file baseRepository dùng chung cho nhiều module, nên tạo một thư mục riêng trong src/common/repositories/ để chứa, ví dụ: src/common/repositories/base.repository.ts. Các module cụ thể nên kế thừa từ baseRepository này để đảm bảo dùng chung logic truy cập dữ liệu ở tầng repository.
6. Thêm file constants/module.constant.ts trong src/common/constants để chứa các hằng số chung cho module (nếu cần, ví dụ tên bảng, key, các enum dùng lặp lại, ...).

Cấu trúc thư mục cho moduleA:
.
├── src/
│   ├── database/
│   │   └── entities/
│   │       └── moduleA.entity.ts
│   ├── common/
│   │   ├── constants/
│   │   │   └── module.constant.ts        # <--- Thêm file constants cho module
│   │   └── repositories/
│   │       └── base.repository.ts         # BaseRepository ở đây
│   └── modules/
│       └── moduleA/
│           ├── moduleA.controller.ts
│           ├── services/
│           │   └── moduleA.service.ts
│           ├── repositories/
│           │   └── moduleA.repository.ts
│           ├── dto/
│           │   └── create-moduleA.dto.ts
│           └── moduleA.module.ts

Ghi chú:
- common/repositories/: Chứa baseRepository và các repository dùng chung toàn hệ thống.
- common/constants/: Chứa các file hằng số, gồm cả module.constant.ts phục vụ moduleA hoặc các module khác dùng chung.
- controllers/: Chứa controller xử lý request/response.
- services/: Chứa nghiệp vụ/business logic của module.
- repositories/: Chứa các repository thao tác với database riêng cho module.
- dto/: Chứa các Data Transfer Object (DTO) dùng để validate dữ liệu đầu vào/đầu ra.
- moduleA.module.ts: Khai báo module con trong NestJS.
- database/entities/: Chứa các entity định nghĩa cấu trúc bảng dữ liệu cho từng module.

Quy trình chi tiết:
- Khi có detail-design cho một module trong specs/moduleA/detail-design.md, dựa vào đó để xác định các thành phần cần có trong module.
- Tạo file specs/moduleA/plan.md để liệt kê kế hoạch phát triển cũng như cấu trúc thư mục sẽ áp dụng cho moduleA trong src/modules/moduleA, bao gồm cả thư mục repositories để lưu các repository của module, thư mục entity trong src/database/entities để lưu các entity của module, thư mục common/repositories để lưu baseRepository dùng chung cho toàn hệ thống, và thư mục common/constants để lưu các file hằng số như module.constant.ts phục vụ chuẩn hoá/tham chiếu tên bảng, enum, key, ...

**Ví dụ đã áp dụng:** [specs/auth/detail-design.md](../specs/auth/detail-design.md) + [specs/auth/plan.md](../specs/auth/plan.md) (module `auth` không có entity riêng — dùng entity user + cấu hình JWT/Firebase).

---

## Quy ước đặt tên API routes (Backend)
Mục tiêu: API dễ đọc, ổn định, map trực tiếp qua frontend `src/api/endpoints`.

### 1) Base prefix
- Ưu tiên: `/api/v1`
- Mỗi module có namespace: `/api/v1/<module>`

### 2) Resource naming
- **Path segment**: kebab-case, dạng số nhiều (plural)
  - Ví dụ: `warehouses`, `purchase-orders`, `stock-movements`
- **Không** dùng động từ trong path (trừ action đặc biệt có lý do rõ ràng)

### 3) CRUD chuẩn
- `GET    /api/v1/<module>/<resources>`: list (pagination, filters)
- `POST   /api/v1/<module>/<resources>`: create
- `GET    /api/v1/<module>/<resources>/:id`: detail
- `PUT    /api/v1/<module>/<resources>/:id`: update (full) hoặc `PATCH` (partial)
- `DELETE /api/v1/<module>/<resources>/:id`: delete (soft-delete nếu áp dụng)

### 4) Action endpoints (nếu bắt buộc)
Chỉ dùng khi không thể mô hình hoá bằng resource.
- Pattern: `POST /api/v1/<module>/<resources>/:id/<action>`
  - Ví dụ: `POST /api/v1/purchase/purchase-orders/:id/approve`
- Action name: kebab-case, động từ ngắn gọn (`approve`, `cancel`, `submit`, `export`)

### 5) Query params chuẩn list
- `page`, `pageSize`
- `sortBy`, `sortDir` (`asc|desc`)
- `q` (search keyword)
- filter theo field: `status`, `fromDate`, `toDate`, ...

### 6) Controller / Service / DTO naming
- Controller: `<Module><Resource>Controller` (PascalCase)
  - file: `<resource>.controller.ts` (kebab-case file name nếu dự án đang theo pattern đó; nếu không thì giữ như hiện tại repo)
- Service: `<Module><Resource>Service`
- DTO:
  - `Create<Resource>Dto`, `Update<Resource>Dto`, `List<Resource>QueryDto`, `Detail<Resource>ParamDto`
- Response:
  - list: `{ items: T[], total: number, page: number, pageSize: number }`
  - error: shape thống nhất (message + code + details/fields nếu validation)
