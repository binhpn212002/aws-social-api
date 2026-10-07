# Thiết kế chi tiết (Detail Design): Module Audit Logs (Lưu trữ độc quyền trên Amazon DynamoDB)

Tài liệu thiết kế chi tiết kỹ thuật cho module **Audit Logs** dựa trên [basic-design.md](file:///Users/macos/project/personal/aws/social/social-api/specs/audit-logs/basic-design.md), lưu trữ **độc quyền trên Amazon DynamoDB** (`social-audit-logs`), tuân thủ các nguyên tắc kiến trúc trong [plan.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/plan.promt.md) và [implement.promt.md](file:///Users/macos/project/personal/aws/social/social-api/promts/implement.promt.md).

---

## 1. Cấu trúc file & thư mục triển khai

Module Audit Logs được thiết kế **hoàn toàn phi quan hệ**, tương tác với bảng DynamoDB `social-audit-logs` đã cấu hình trong `sst.config.ts`, không tạo entity trong PostgreSQL:

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
│   │   └── services/auth.service.ts           # Phát event 'audit.log' khi đăng nhập, đổi mật khẩu,...
│   └── audit-logs/
│       ├── audit-logs.controller.ts           # Định tuyến /api/v1/audit-logs (/me, /, /:id)
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
│       │   └── audit-log.interface.ts         # Khai báo TypeScript Interface cho bản ghi DynamoDB
│       └── dto/
│           ├── get-my-audit-logs-query.dto.ts # DTO phân trang lịch sử cá nhân (Cursor pagination)
│           ├── get-audit-logs-query.dto.ts    # DTO lọc đa tiêu chí cho Quản trị viên (Admin)
│           ├── audit-log-response.dto.ts      # DTO trả về danh sách kèm cursor & chi tiết log
│           └── security-alert.dto.ts          # DTO thông báo sự cố an ninh & Brute-Force
```

---

## 2. Thiết kế Mô hình Dữ liệu Amazon DynamoDB (Single-Table Design)

Bảng DynamoDB sử dụng tài nguyên đã định nghĩa trong `sst.config.ts`:
- **Tên bảng**: `social-audit-logs`
- **Partition Key (PK)**: `String (S)`
- **Sort Key (SK)**: `String (S)`
- **TTL Attribute**: `ttl` (Number - Epoch timestamp theo giây, tự động hết hạn sau 90 ngày)

### 2.1. Bảng thiết kế Item & Mẫu truy vấn (Access Patterns)

| Thực thể / Mục đích truy vấn | Partition Key (PK) | Sort Key (SK) | Các thuộc tính dữ liệu (Attributes) | Access Pattern |
| :--- | :--- | :--- | :--- | :--- |
| **Lịch sử User** *(User Timeline)* | `USER#{userId}` | `LOG#{createdAt}#{logId}` | `id`, `userId`, `identifier`, `category`, `action`, `status`, `ipAddress`, `userAgent`, `deviceInfo`, `failureReason`, `metadata`, `createdAt`, `ttl` | `Query`: `PK = USER#{userId} AND SK begins_with "LOG#"`, `ScanIndexForward = false` |
| **Lịch sử theo Identifier** *(Failed/Anonymous Timeline)* | `IDENTIFIER#{identifier}` | `LOG#{createdAt}#{logId}` | Tương tự bản ghi User | `Query`: `PK = IDENTIFIER#{identifier} AND SK begins_with "LOG#"` |
| **Tra cứu trực tiếp theo ID** *(Direct Lookup)* | `LOG#{logId}` | `METADATA` | Bản ghi chi tiết đầy đủ | `GetItem`: `PK = LOG#{logId}, SK = METADATA` (Tốc độ O(1) < 5ms) |
| **Dòng thời gian Admin** *(System Monthly Timeline)* | `SYSTEM_LOGS#{YYYY-MM}` | `TIMESTAMP#{createdAt}#{logId}` | Toàn bộ dữ liệu log | `Query`: `PK = SYSTEM_LOGS#{YYYY-MM} AND SK between ...` với `FilterExpression` |
| **Cửa sổ trượt Brute-Force Identifier** | `FAILED#{identifier}` | `TIMESTAMP#{createdAt}#{logId}` | `identifier`, `ipAddress`, `createdAt`, `ttl` (15 phút) | `Query`: `PK = FAILED#{identifier} AND SK >= TIMESTAMP#{tenMinutesAgo}`, `Select = COUNT` |
| **Cửa sổ trượt Brute-Force IP** | `FAILED_IP#{ipAddress}` | `TIMESTAMP#{createdAt}#{logId}` | `identifier`, `ipAddress`, `createdAt`, `ttl` (15 phút) | `Query`: `PK = FAILED_IP#{ipAddress} AND SK >= TIMESTAMP#{tenMinutesAgo}`, `Select = COUNT` |

---

### 2.2. TypeScript Interface & Enums: `src/modules/audit-logs/interfaces/audit-log.interface.ts`

```typescript
export enum AuditCategory {
  AUTH = 'AUTH',
  ACCOUNT_SECURITY = 'ACCOUNT_SECURITY',
  ADMIN_ACTION = 'ADMIN_ACTION',
}

export enum AuditAction {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  REFRESH_TOKEN = 'REFRESH_TOKEN',
  CHANGE_PASSWORD_SUCCESS = 'CHANGE_PASSWORD_SUCCESS',
  CHANGE_PASSWORD_FAILED = 'CHANGE_PASSWORD_FAILED',
  FORGOT_PASSWORD_REQUEST = 'FORGOT_PASSWORD_REQUEST',
  RESET_PASSWORD_SUCCESS = 'RESET_PASSWORD_SUCCESS',
}

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

export interface IAuditLogItem {
  PK: string;
  SK: string;
  id: string;
  userId?: string | null;
  identifier: string;
  category: AuditCategory;
  action: AuditAction;
  status: AuditStatus;
  ipAddress: string;
  userAgent?: string | null;
  deviceInfo?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string; // ISO-8601
  ttl: number;       // Unix epoch timestamp (giây)
}
```

---

## 3. Data Transfer Objects (DTO)

### 3.1. `src/modules/audit-logs/events/audit-log.event.ts`
Sự kiện nội bộ phát đi qua NestJS EventBus:

```typescript
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
} from '../interfaces/audit-log.interface';

export class AuditLogEvent {
  userId?: string | null;
  identifier: string;
  category: AuditCategory;
  action: AuditAction;
  status: AuditStatus;
  ipAddress: string;
  userAgent?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, any> | null;

  constructor(partial: Partial<AuditLogEvent>) {
    Object.assign(this, partial);
  }
}
```

---

### 3.2. `src/modules/audit-logs/dto/get-my-audit-logs-query.dto.ts`
DTO truy vấn cá nhân sử dụng con trỏ phân trang (Cursor-based Pagination) tối ưu cho DynamoDB:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetMyAuditLogsQueryDto {
  @ApiPropertyOptional({
    description: 'Số lượng bản ghi trên một trang (tối đa 50)',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Con trỏ phân trang (Cursor) trả về từ lần truy vấn trước',
    example: 'eyJQSyI6IlVTRVIjMTIzIiwiU0siOiJMT0cjMjAyNi0xMC0wMlQxOTowMDowMC4wMDBaI3V1aWQifQ==',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
```

---

### 3.3. `src/modules/audit-logs/dto/get-audit-logs-query.dto.ts`
DTO dành cho Quản trị viên (Admin) lọc nhật ký toàn hệ thống:

```typescript
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
} from '../interfaces/audit-log.interface';

export class GetAuditLogsQueryDto {
  @ApiPropertyOptional({
    description: 'Lọc theo ID người dùng cụ thể',
    example: '78a9c140-5b43-41bb-aef3-018274cbef01',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId phải là một UUID hợp lệ' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo email hoặc tên tài khoản',
    example: 'admin@social.com',
  })
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional({
    description: 'Tháng cần tra cứu (định dạng YYYY-MM, mặc định: tháng hiện tại)',
    example: '2026-10',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month phải có định dạng YYYY-MM' })
  month?: string;

  @ApiPropertyOptional({
    description: 'Phân loại nhóm hành động',
    enum: AuditCategory,
  })
  @IsOptional()
  @IsEnum(AuditCategory)
  category?: AuditCategory;

  @ApiPropertyOptional({
    description: 'Tên hành động cụ thể',
    enum: AuditAction,
  })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({
    description: 'Trạng thái kết quả thao tác',
    enum: AuditStatus,
  })
  @IsOptional()
  @IsEnum(AuditStatus)
  status?: AuditStatus;

  @ApiPropertyOptional({
    description: 'Lọc theo địa chỉ IP nguồn',
    example: '14.241.23.10',
  })
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional({
    description: 'Số lượng bản ghi mỗi trang (tối đa 100)',
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Con trỏ phân trang (Cursor)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
```

---

### 3.4. `src/modules/audit-logs/dto/audit-log-response.dto.ts`
DTO chuẩn hóa dữ liệu trả về cho client:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
} from '../interfaces/audit-log.interface';

export class AuditLogItemDto {
  @ApiProperty({ example: '7fa1bc82-0192-4f2a-8c65-b1a9e88029d1' })
  id: string;

  @ApiPropertyOptional({ example: '78a9c140-5b43-41bb-aef3-018274cbef01' })
  userId?: string | null;

  @ApiProperty({ example: 'user_a@social.com' })
  identifier: string;

  @ApiProperty({ enum: AuditCategory, example: AuditCategory.AUTH })
  category: AuditCategory;

  @ApiProperty({ enum: AuditAction, example: AuditAction.LOGIN_SUCCESS })
  action: AuditAction;

  @ApiProperty({ enum: AuditStatus, example: AuditStatus.SUCCESS })
  status: AuditStatus;

  @ApiProperty({ example: '14.241.23.10' })
  ipAddress: string;

  @ApiPropertyOptional({ example: 'Chrome / macOS' })
  deviceInfo?: string | null;

  @ApiPropertyOptional({ example: 'INVALID_CREDENTIALS' })
  failureReason?: string | null;

  @ApiProperty({ example: '2026-10-02T19:00:00.000Z' })
  createdAt: string;
}

export class AuditLogDetailResponseDto extends AuditLogItemDto {
  @ApiPropertyOptional({ example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...' })
  userAgent?: string | null;

  @ApiPropertyOptional({
    example: { country: 'VN', city: 'Hanoi', isp: 'FPT Telecom' },
  })
  metadata?: Record<string, any> | null;
}

export class DynamoPaginationMetaDto {
  @ApiProperty({ example: 10 })
  count: number;

  @ApiPropertyOptional({
    description: 'Chuỗi con trỏ (Cursor) dùng để tải trang tiếp theo (null nếu là trang cuối)',
    example: 'eyJQSyI6IlVTRVIjMTIzIiwiU0siOiJMT0cjMjAyNi0xMC0wMlQxOTowMDowMC4wMDBaI3V1aWQifQ==',
  })
  nextCursor?: string | null;

  @ApiProperty({ example: true })
  hasMore: boolean;
}

export class AuditLogListResponseDto {
  @ApiProperty({ type: [AuditLogItemDto] })
  items: AuditLogItemDto[];

  @ApiProperty({ type: DynamoPaginationMetaDto })
  meta: DynamoPaginationMetaDto;
}
```

---

## 4. Chi tiết Repository Amazon DynamoDB

### `AuditLogRepository`: `src/modules/audit-logs/repositories/audit-log.repository.ts`
Sử dụng `@aws-sdk/client-dynamodb` và `@aws-sdk/lib-dynamodb` (`DynamoDBDocumentClient`) thao tác trực tiếp với bảng `social-audit-logs`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import {
  AuditAction,
  AuditCategory,
  AuditStatus,
  IAuditLogItem,
} from '../interfaces/audit-log.interface';
import { GetMyAuditLogsQueryDto } from '../dto/get-my-audit-logs-query.dto';
import { GetAuditLogsQueryDto } from '../dto/get-audit-logs-query.dto';
import { DynamoPaginationMetaDto } from '../dto/audit-log-response.dto';

@Injectable()
export class AuditLogRepository {
  private readonly logger = new Logger(AuditLogRepository.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    const region = this.configService.get<string>('aws.dynamodb.region') || 'ap-southeast-1';
    this.tableName =
      this.configService.get<string>('aws.dynamodb.auditLogTableName') || 'social-audit-logs';

    const client = new DynamoDBClient({
      region,
      credentials: {
        accessKeyId: this.configService.get<string>('aws.accessKeyId') || '',
        secretAccessKey: this.configService.get<string>('aws.secretAccessKey') || '',
      },
    });

    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  /**
   * Lưu trữ bản ghi kiểm toán mới vào DynamoDB (Append-Only)
   * Sử dụng BatchWriteCommand để lưu song song:
   * 1. Bản ghi User/Identifier Timeline
   * 2. Bản ghi Tra cứu trực tiếp theo Log ID (PK: LOG#id, SK: METADATA)
   * 3. Bản ghi Dòng thời gian hệ thống theo tháng (Admin timeline)
   */
  async appendLog(data: {
    userId?: string | null;
    identifier: string;
    category: AuditCategory;
    action: AuditAction;
    status: AuditStatus;
    ipAddress: string;
    userAgent?: string | null;
    deviceInfo?: string | null;
    failureReason?: string | null;
    metadata?: Record<string, any> | null;
  }): Promise<IAuditLogItem> {
    const logId = randomUUID();
    const createdAt = new Date().toISOString();
    // TTL mặc định 90 ngày (tính bằng giây Epoch)
    const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60;
    const currentMonth = createdAt.substring(0, 7); // YYYY-MM

    const baseAttributes = {
      id: logId,
      userId: data.userId || null,
      identifier: data.identifier,
      category: data.category,
      action: data.action,
      status: data.status,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent || null,
      deviceInfo: data.deviceInfo || null,
      failureReason: data.failureReason || null,
      metadata: data.metadata || null,
      createdAt,
      ttl,
    };

    // 1. Item Timeline theo User hoặc Identifier
    const timelinePK = data.userId ? `USER#${data.userId}` : `IDENTIFIER#${data.identifier.toLowerCase()}`;
    const timelineItem: IAuditLogItem = {
      ...baseAttributes,
      PK: timelinePK,
      SK: `LOG#${createdAt}#${logId}`,
    };

    // 2. Item tra cứu nhanh theo ID
    const directLookupItem: IAuditLogItem = {
      ...baseAttributes,
      PK: `LOG#${logId}`,
      SK: `METADATA`,
    };

    // 3. Item dòng thời gian hệ thống theo tháng
    const monthlyAdminItem: IAuditLogItem = {
      ...baseAttributes,
      PK: `SYSTEM_LOGS#${currentMonth}`,
      SK: `TIMESTAMP#${createdAt}#${logId}`,
    };

    const putRequests: any[] = [
      { PutRequest: { Item: timelineItem } },
      { PutRequest: { Item: directLookupItem } },
      { PutRequest: { Item: monthlyAdminItem } },
    ];

    // 4. Nếu đăng nhập thất bại, thêm bản ghi phục vụ trượt đếm Brute-Force (TTL ngắn 15 phút)
    if (data.status === AuditStatus.FAILURE) {
      const slidingTtl = Math.floor(Date.now() / 1000) + 15 * 60;
      putRequests.push({
        PutRequest: {
          Item: {
            PK: `FAILED#${data.identifier.toLowerCase()}`,
            SK: `TIMESTAMP#${createdAt}#${logId}`,
            identifier: data.identifier.toLowerCase(),
            ipAddress: data.ipAddress,
            createdAt,
            ttl: slidingTtl,
          },
        },
      });
      putRequests.push({
        PutRequest: {
          Item: {
            PK: `FAILED_IP#${data.ipAddress}`,
            SK: `TIMESTAMP#${createdAt}#${logId}`,
            identifier: data.identifier.toLowerCase(),
            ipAddress: data.ipAddress,
            createdAt,
            ttl: slidingTtl,
          },
        },
      });
    }

    await this.docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: putRequests,
        },
      }),
    );

    return directLookupItem;
  }

  /**
   * Lấy lịch sử cá nhân của người dùng (Query trên PK = USER#userId)
   */
  async getMyLogs(
    userId: string,
    query: GetMyAuditLogsQueryDto,
  ): Promise<{ items: IAuditLogItem[]; meta: DynamoPaginationMetaDto }> {
    const limit = Math.max(1, Math.min(50, Number(query.limit) || 10));
    const exclusiveStartKey = this.decodeCursor(query.cursor);

    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${userId}`,
        ':skPrefix': 'LOG#',
      },
      ScanIndexForward: false, // Mới nhất lên đầu
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const result = await this.docClient.send(command);
    const items = (result.Items || []) as IAuditLogItem[];
    const nextCursor = this.encodeCursor(result.LastEvaluatedKey);

    return {
      items,
      meta: {
        count: items.length,
        nextCursor,
        hasMore: !!result.LastEvaluatedKey,
      },
    };
  }

  /**
   * Lấy chi tiết bản ghi theo ID (GetItem tức thời O(1))
   */
  async getLogById(logId: string): Promise<IAuditLogItem | null> {
    const command = new GetCommand({
      TableName: this.tableName,
      Key: {
        PK: `LOG#${logId}`,
        SK: 'METADATA',
      },
    });

    const result = await this.docClient.send(command);
    return (result.Item as IAuditLogItem) || null;
  }

  /**
   * Lấy danh sách kiểm toán cho Admin (hỗ trợ lọc theo userId, identifier, tháng và các trường khác)
   */
  async getLogsForAdmin(
    query: GetAuditLogsQueryDto,
  ): Promise<{ items: IAuditLogItem[]; meta: DynamoPaginationMetaDto }> {
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const exclusiveStartKey = this.decodeCursor(query.cursor);

    // Xác định Partition Key truy vấn chính
    let pk = `SYSTEM_LOGS#${query.month || new Date().toISOString().substring(0, 7)}`;
    let skPrefix = 'TIMESTAMP#';

    if (query.userId) {
      pk = `USER#${query.userId}`;
      skPrefix = 'LOG#';
    } else if (query.identifier) {
      pk = `IDENTIFIER#${query.identifier.trim().toLowerCase()}`;
      skPrefix = 'LOG#';
    }

    // Xây dựng FilterExpression cho các thuộc tính phụ
    const filterExpressions: string[] = [];
    const expressionAttributeValues: Record<string, any> = {
      ':pk': pk,
      ':skPrefix': skPrefix,
    };
    const expressionAttributeNames: Record<string, string> = {};

    if (query.action) {
      filterExpressions.push('#action = :action');
      expressionAttributeNames['#action'] = 'action';
      expressionAttributeValues[':action'] = query.action;
    }

    if (query.status) {
      filterExpressions.push('#status = :status');
      expressionAttributeNames['#status'] = 'status';
      expressionAttributeValues[':status'] = query.status;
    }

    if (query.ipAddress) {
      filterExpressions.push('ipAddress = :ipAddress');
      expressionAttributeValues[':ipAddress'] = query.ipAddress.trim();
    }

    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      FilterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : undefined,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: exclusiveStartKey,
    });

    const result = await this.docClient.send(command);
    const items = (result.Items || []) as IAuditLogItem[];
    const nextCursor = this.encodeCursor(result.LastEvaluatedKey);

    return {
      items,
      meta: {
        count: items.length,
        nextCursor,
        hasMore: !!result.LastEvaluatedKey,
      },
    };
  }

  /**
   * Đếm số lần đăng nhập thất bại trong N phút gần đây (Sliding Window Brute-Force)
   */
  async countRecentFailedLogins(
    identifier: string,
    ipAddress: string,
    windowMinutes: number = 10,
  ): Promise<{ byIdentifier: number; byIp: number }> {
    const sinceTimestamp = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const [identRes, ipRes] = await Promise.all([
      this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND SK >= :sinceSK',
          ExpressionAttributeValues: {
            ':pk': `FAILED#${identifier.toLowerCase()}`,
            ':sinceSK': `TIMESTAMP#${sinceTimestamp}`,
          },
          Select: 'COUNT',
        }),
      ),
      this.docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'PK = :pk AND SK >= :sinceSK',
          ExpressionAttributeValues: {
            ':pk': `FAILED_IP#${ipAddress}`,
            ':sinceSK': `TIMESTAMP#${sinceTimestamp}`,
          },
          Select: 'COUNT',
        }),
      ),
    ]);

    return {
      byIdentifier: identRes.Count || 0,
      byIp: ipRes.Count || 0,
    };
  }

  private encodeCursor(key?: Record<string, any>): string | null {
    if (!key) return null;
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  private decodeCursor(cursor?: string): Record<string, any> | undefined {
    if (!cursor) return undefined;
    try {
      return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
    } catch {
      return undefined;
    }
  }
}
```

---

## 5. Chi tiết Dịch vụ & Xử lý sự kiện (Services & Event Processing)

### 5.1. Tiện ích trích xuất Client Info: `src/common/utils/client-info.util.ts`

```typescript
import { Request } from 'express';

export class ClientInfoUtil {
  /**
   * Trích xuất địa chỉ IP thực của client từ các headers của AWS CloudFront / ALB / Nginx
   */
  static extractClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const cloudfrontIp = req.headers['cloudfront-viewer-address'];
    if (cloudfrontIp) {
      const address = Array.isArray(cloudfrontIp) ? cloudfrontIp[0] : cloudfrontIp;
      return address.split(':')[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0].trim() : realIp.trim();
    }

    return req.ip || req.socket.remoteAddress || '127.0.0.1';
  }

  /**
   * Chuẩn hóa User-Agent thành định dạng ngắn gọn: [Trình duyệt] / [Hệ điều hành]
   */
  static parseDeviceInfo(userAgent?: string | null): string {
    if (!userAgent || userAgent.trim() === '') {
      return 'Unknown Device';
    }

    const ua = userAgent.toLowerCase();

    // Hệ điều hành
    let os = 'Unknown OS';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
      os = 'iOS';
    } else if (ua.includes('android')) {
      os = 'Android';
    } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
      os = 'macOS';
    } else if (ua.includes('windows')) {
      os = 'Windows';
    } else if (ua.includes('linux')) {
      os = 'Linux';
    }

    // Trình duyệt / Client
    let browser = 'Unknown Client';
    if (ua.includes('postmanruntime')) {
      browser = 'Postman';
    } else if (ua.includes('edg/')) {
      browser = 'Edge';
    } else if (ua.includes('chrome/') && !ua.includes('edg/')) {
      browser = 'Chrome';
    } else if (ua.includes('safari/') && !ua.includes('chrome/')) {
      browser = 'Safari';
    } else if (ua.includes('firefox/')) {
      browser = 'Firefox';
    } else if (ua.includes('okhttp') || ua.includes('cfnetwork')) {
      browser = 'Mobile App';
    }

    return `${browser} / ${os}`;
  }
}
```

---

### 5.2. `AuditLogService`: `src/modules/audit-logs/services/audit-log.service.ts`

```typescript
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { AuditLogRepository } from '../repositories/audit-log.repository';
import {
  AuditStatus,
  IAuditLogItem,
} from '../interfaces/audit-log.interface';
import { AuditLogEvent } from '../events/audit-log.event';
import { GetMyAuditLogsQueryDto } from '../dto/get-my-audit-logs-query.dto';
import { GetAuditLogsQueryDto } from '../dto/get-audit-logs-query.dto';
import {
  AuditLogDetailResponseDto,
  AuditLogItemDto,
  AuditLogListResponseDto,
} from '../dto/audit-log-response.dto';
import { ClientInfoUtil } from '../../../common/utils/client-info.util';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private static readonly BRUTE_FORCE_THRESHOLD = 5;
  private static readonly BRUTE_FORCE_WINDOW_MINUTES = 10;

  constructor(private readonly auditLogRepository: AuditLogRepository) {}

  /**
   * Xử lý sự kiện ghi nhật ký kiểm toán vào DynamoDB
   */
  async processAuditLogEvent(event: AuditLogEvent): Promise<IAuditLogItem> {
    try {
      const deviceInfo = ClientInfoUtil.parseDeviceInfo(event.userAgent);

      const record = await this.auditLogRepository.appendLog({
        userId: event.userId || null,
        identifier: event.identifier,
        category: event.category,
        action: event.action,
        status: event.status,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent || null,
        deviceInfo,
        failureReason: event.failureReason || null,
        metadata: event.metadata || null,
      });

      // Nếu đăng nhập thất bại, kiểm tra Brute-Force
      if (event.status === AuditStatus.FAILURE) {
        await this.detectBruteForce(event.identifier, event.ipAddress);
      }

      return record;
    } catch (error) {
      this.logger.error(
        `Không thể lưu bản ghi AuditLog vào DynamoDB: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Phát hiện Brute-Force từ DynamoDB Sliding Window
   */
  private async detectBruteForce(
    identifier: string,
    ipAddress: string,
  ): Promise<void> {
    try {
      const { byIdentifier, byIp } =
        await this.auditLogRepository.countRecentFailedLogins(
          identifier,
          ipAddress,
          AuditLogService.BRUTE_FORCE_WINDOW_MINUTES,
        );

      if (
        byIdentifier >= AuditLogService.BRUTE_FORCE_THRESHOLD ||
        byIp >= AuditLogService.BRUTE_FORCE_THRESHOLD
      ) {
        this.logger.warn(
          `[SECURITY ALERT] Phát hiện dấu hiệu Brute-Force trên DynamoDB! Identifier: ${identifier}, IP: ${ipAddress}, Thất bại: byIdentifier=${byIdentifier}, byIp=${byIp}`,
        );
      }
    } catch (err) {
      this.logger.error(`Lỗi khi quét Brute-Force trên DynamoDB: ${err.message}`);
    }
  }

  /**
   * Lấy lịch sử bảo mật người dùng đang đăng nhập
   */
  async getMyAuditLogs(
    userId: string,
    query: GetMyAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    const { items, meta } = await this.auditLogRepository.getMyLogs(
      userId,
      query,
    );

    return {
      items: items.map((item) => this.mapToItemDto(item)),
      meta,
    };
  }

  /**
   * Lấy danh sách kiểm toán hệ thống cho Admin
   */
  async getAuditLogsForAdmin(
    query: GetAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    const { items, meta } = await this.auditLogRepository.getLogsForAdmin(query);

    return {
      items: items.map((item) => this.mapToItemDto(item)),
      meta,
    };
  }

  /**
   * Xem chi tiết 1 bản ghi kiểm toán bằng ID
   */
  async getAuditLogDetail(
    id: string,
    requestUserId: string,
    isAdmin: boolean,
  ): Promise<AuditLogDetailResponseDto> {
    const log = await this.auditLogRepository.getLogById(id);

    if (!log) {
      throw new NotFoundException('Không tìm thấy bản ghi kiểm toán');
    }

    if (!isAdmin && log.userId !== requestUserId) {
      throw new ForbiddenException('Bạn không có quyền truy cập bản ghi này');
    }

    return this.mapToDetailDto(log);
  }

  private mapToItemDto(log: IAuditLogItem): AuditLogItemDto {
    return {
      id: log.id,
      userId: log.userId,
      identifier: log.identifier,
      category: log.category,
      action: log.action,
      status: log.status,
      ipAddress: log.ipAddress,
      deviceInfo: log.deviceInfo,
      failureReason: log.failureReason,
      createdAt: log.createdAt,
    };
  }

  private mapToDetailDto(log: IAuditLogItem): AuditLogDetailResponseDto {
    const base = this.mapToItemDto(log);
    return {
      ...base,
      userAgent: log.userAgent,
      metadata: log.metadata,
    };
  }
}
```

---

### 5.3. `AuditLogListener`: `src/modules/audit-logs/listeners/audit-log.listener.ts`
Lắng nghe sự kiện bất đồng bộ qua NestJS EventEmitter:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLogService } from '../services/audit-log.service';
import { AuditLogEvent } from '../events/audit-log.event';

@Injectable()
export class AuditLogListener {
  private readonly logger = new Logger(AuditLogListener.name);

  constructor(private readonly auditLogService: AuditLogService) {}

  @OnEvent('audit.log', { async: true })
  async handleAuditLogEvent(event: AuditLogEvent): Promise<void> {
    try {
      await this.auditLogService.processAuditLogEvent(event);
    } catch (error) {
      this.logger.error(
        `Xử lý nền sự kiện audit.log vào DynamoDB thất bại: ${error.message}`,
        error.stack,
      );
    }
  }
}
```

---

## 6. Chi tiết Controllers & API Endpoints

### `AuditLogController`: `src/modules/audit-logs/audit-logs.controller.ts`

```typescript
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AuditLogService } from './services/audit-log.service';
import { GetMyAuditLogsQueryDto } from './dto/get-my-audit-logs-query.dto';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';
import {
  AuditLogDetailResponseDto,
  AuditLogListResponseDto,
} from './dto/audit-log-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xem lịch sử an ninh & hoạt động cá nhân (My Audit Logs)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách nhật ký bảo mật của người dùng hiện tại từ DynamoDB',
    type: AuditLogListResponseDto,
  })
  async getMyAuditLogs(
    @CurrentUser('sub') userId: string,
    @Query() query: GetMyAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditLogService.getMyAuditLogs(userId, query);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tra cứu & lọc toàn bộ nhật ký kiểm toán hệ thống từ DynamoDB (Dành riêng cho Admin)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách nhật ký kiểm toán toàn hệ thống kèm phân trang Cursor và bộ lọc',
    type: AuditLogListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Từ chối truy cập nếu không phải tài khoản Quản trị viên',
  })
  async getAuditLogs(
    @Query() query: GetAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditLogService.getAuditLogsForAdmin(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xem chi tiết một bản ghi kiểm toán kèm siêu dữ liệu (Metadata)' })
  @ApiParam({ name: 'id', description: 'UUID của bản ghi kiểm toán' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thông tin chi tiết bản ghi kiểm toán truy xuất O(1) từ DynamoDB',
    type: AuditLogDetailResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy bản ghi kiểm toán',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không có quyền xem bản ghi của người khác nếu không phải Admin',
  })
  async getAuditLogDetail(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AuditLogDetailResponseDto> {
    const isAdmin = role === UserRole.ADMIN;
    return this.auditLogService.getAuditLogDetail(id, userId, isAdmin);
  }
}
```

---

## 7. Khai báo Module (`src/modules/audit-logs/audit-logs.module.ts`)

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuditLogController } from './audit-logs.controller';
import { AuditLogService } from './services/audit-log.service';
import { AuditLogRepository } from './repositories/audit-log.repository';
import { AuditLogListener } from './listeners/audit-log.listener';

@Module({
  imports: [
    ConfigModule,
    EventEmitterModule.forRoot(),
  ],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogRepository, AuditLogListener],
  exports: [AuditLogService, AuditLogRepository],
})
export class AuditLogsModule {}
```

---

## 8. Quy chuẩn An ninh & Vận hành DynamoDB (Production Standard)

1. **Phân quyền tối thiểu IAM Policy (Tamper-Proof Policy)**:
   - IAM Role của Lambda hoặc NestJS container trên AWS chỉ được cấp các action:
     ```json
     {
       "Effect": "Allow",
       "Action": [
         "dynamodb:PutItem",
         "dynamodb:BatchWriteItem",
         "dynamodb:GetItem",
         "dynamodb:Query",
         "dynamodb:Scan"
       ],
       "Resource": "arn:aws:dynamodb:ap-southeast-1:*:table/social-audit-logs"
     }
     ```
   - Hành động `dynamodb:DeleteItem` và `dynamodb:UpdateItem` tuyệt đối không được cấp phép, đảm bảo tính toàn vẹn và không thể làm giả mạo bản ghi.

2. **Cơ chế thu hồi dữ liệu tự động (DynamoDB Time-To-Live)**:
   - Trường `ttl` lưu Epoch seconds = `Math.floor(Date.now() / 1000) + 90 * 86400`.
   - Cơ chế ngầm của AWS DynamoDB tự động xóa bỏ các Item hết hạn sau 90 ngày hoàn toàn miễn phí, không tốn tài nguyên RCU/WCU và không cần cron job định kỳ.

---

## 9. Ma trận Kiểm thử (Test Cases Matrix)

| STT | Endpoint / Hàm | Kịch bản kiểm thử | Dữ liệu đầu vào | Kỳ vọng kết quả |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `GET /me` | Lấy lịch sử khi chưa đăng nhập | Không có Bearer token | `401 Unauthorized` |
| 2 | `GET /me` | Lấy lịch sử người dùng hiện tại thành công | Token hợp lệ, `limit=10` | `200 OK`, danh sách bản ghi cá nhân, meta phân trang Cursor |
| 3 | `GET /` | Người dùng thông thường (USER) cố truy cập API admin | Token User thông thường | `403 Forbidden` |
| 4 | `GET /` | Quản trị viên (ADMIN) truy cập danh sách toàn hệ thống | Token Admin, `month=2026-10` | `200 OK`, danh sách các bản ghi từ bảng DynamoDB |
| 5 | `GET /` | Quản trị viên lọc theo identifier | `identifier=admin@social.com` | `200 OK`, Query `PK = IDENTIFIER#admin@social.com` |
| 6 | `GET /` | Quản trị viên lọc theo hành động thất bại | `action=LOGIN_FAILED&status=FAILURE` | `200 OK`, FilterExpression áp dụng chính xác |
| 7 | `GET /:id` | Người dùng xem bản ghi chi tiết của chính mình | `id` của log thuộc `userId` | `200 OK`, GetItem `PK = LOG#id, SK = METADATA` O(1) |
| 8 | `GET /:id` | Người dùng cố xem bản ghi chi tiết của người khác | `id` của log thuộc `user_b` | `403 Forbidden` |
| 9 | `GET /:id` | Quản trị viên xem bản ghi chi tiết của bất kỳ ai | `id` hợp lệ, Token Admin | `200 OK`, trả về siêu dữ liệu `metadata` |
| 10 | `GET /:id` | Xem bản ghi với ID không tồn tại | `id = uuid_random` | `404 Not Found` |
| 11 | `GET /:id` | Xem bản ghi với ID sai định dạng UUID | `id = invalid-uuid` | `400 Bad Request` |
| 12 | Event Listener | Phát sự kiện `LOGIN_SUCCESS` | Event hợp lệ có IP và UserAgent | Lưu vào DynamoDB với 3 Item (User timeline, Direct lookup, Monthly timeline) |
| 13 | Event Listener | Phát sự kiện `LOGIN_FAILED` | Event với lý do `INVALID_PASSWORD` | Lưu vào DynamoDB kèm 2 Item đếm Brute-force (TTL = 15m) |
| 14 | Anomaly Detection | Phát hiện Brute-Force khi thất bại liên tiếp 5 lần | 5 sự kiện `LOGIN_FAILED` cùng email trong 5 phút | Query COUNT `>= 5`, kích hoạt `[SECURITY ALERT]` |
| 15 | Client Info Util | Phân tích IP client sau AWS CloudFront / ALB | Header `x-forwarded-for: 113.161.40.55, 10.0.0.1` | Trích xuất chính xác IP gốc `113.161.40.55` |
| 16 | Client Info Util | Chuẩn hóa User-Agent trình duyệt | `Mozilla/5.0 (Macintosh; Intel...) Chrome/122` | Trả về `deviceInfo = "Chrome / macOS"` |
