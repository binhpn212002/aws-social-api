# Prompt: Triển khai code (Implement)

Dùng prompt này khi **đã có** `specs/<module>/detail-design.md` và (nếu có) `specs/<module>/plan.md` theo quy trình trong `plan.promt.md`. Mục tiêu: sinh code NestJS đúng thiết kế, **ưu tiên tuyệt đối** tái sử dụng các thành phần trong `src/common` khi đã tồn tại hoặc khi thiết kế yêu cầu lớp nền chung.

---

## Đầu vào bắt buộc

- `specs/<module>/detail-design.md` (và các tài liệu liên quan trong cùng thư mục specs).
- File kế hoạch nếu có: `specs/<module>/plan.md`.
- Cấu trúc thư mục dự án như mô tả trong `plan.promt.md`.

---

## Nguyên tắc bắt buộc: dùng `src/common`

1. **Trước khi viết code mới**, quét `src/common` (và `src/shared` nếu có): `decorators/`, `guards/`, `filters/`, `interceptors/`, `utils/`, `constants/`, `exception/`, `repositories/`.
2. **Nếu đã có** lớp/tiện ích phù hợp → **phải** import và dùng, không nhân bản logic.
3. **Nếu chưa có** nhưng nhiều module sẽ cần (ví dụ pagination chung, soft-delete, audit) → **ưu tiên** bổ sung vào `src/common` (hoặc `src/shared`) trước, rồi module gọi từ đó; tránh nhét logic dùng chung vào từng module.
4. **Repository (bắt buộc khi dùng pattern repository)**  
   - `src/common/repositories/` chứa **BaseRepository** (hoặc tên tương đương, ví dụ `base.repository.ts`).  
   - Mọi repository theo module tại `src/modules/<module>/repositories/*.repository.ts` **phải kế thừa** BaseRepository khi BaseRepository đã tồn tại hoặc vừa được tạo cho dự án.  
   - Chỉ override/thêm method đặc thù entity/module; logic CRUD/filter/pagination chung nằm ở base.
5. **Entity**: đặt tại `src/database/entities/`; nếu có `src/shared/base.entity.ts` (hoặc entity base trong common) thì **entity module nên kế thừa** base entity khi thiết kế cho phép (id, timestamp, v.v.).
6. **Exception / DTO / validation**: dùng exception filter/interceptor/decorator trong `common` nếu có; DTO dùng class-validator theo chuẩn đã có trong project.

---

## Phạm vi file theo module (khớp `plan.promt.md`)

- `src/database/entities/<module>.entity.ts` (hoặc nhiều entity nếu detail-design yêu cầu).
- `src/modules/<module>/`  
  - `*.controller.ts`  
  - `services/*.service.ts`  
  - `repositories/*.repository.ts` (**kế thừa BaseRepository**)  
  - `dto/*.dto.ts`  
  - `<module>.module.ts`
- Đăng ký provider/controller trong `*.module.ts`; cập nhật `app.module.ts` (hoặc module cha) nếu cần.

---

## Thứ tự thực hiện gợi ý

1. Đọc `detail-design.md` và `plan.md` (nếu có).  
2. Kiểm tra/ tạo BaseRepository trong `common/repositories` nếu chưa có và detail-design dùng repository.  
3. Entity → Repository (extends BaseRepository) → Service → Controller → Module wiring.  
4. Viết/ chạy test nếu project đã có pattern test (e2e/unit).

---

## Kiểm tra trước khi coi là xong

- [ ] Không trùng lặp logic đã có trong `common` (trừ khi detail-design bắt buộc khác biệt — ghi chú trong code ngắn gọn nếu cần).  
- [ ] Repository module **kế thừa** `BaseRepository` (khi pattern repository được dùng).  
- [ ] Đường dẫn file và naming khớp cấu trúc trong `plan.promt.md`.  
- [ ] Build/lint pass theo cấu hình dự án (`package.json`).

---

## Cách gọi prompt ngắn (copy-paste)

> Implement module `<TênModule>` theo `specs/<module>/detail-design.md` và `specs/<module>/plan.md`. **Bắt buộc** dùng các thành phần trong `src/common` khi có thể: repository phải kế thừa BaseRepository tại `src/common/repositories/`; entity ưu tiên kế thừa base entity nếu có; không nhân bản guard/filter/interceptor/utils đã có trong `common`. Tuân thủ cấu trúc thư mục trong `plan.promt.md`.