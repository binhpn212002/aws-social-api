import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
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
    const region =
      this.configService.get<string>('aws.dynamodb.region') ||
      this.configService.get<string>('aws.region') ||
      'ap-southeast-1';

    this.tableName =
      this.configService.get<string>('aws.dynamodb.auditLogTableName') ||
      'social-audit-logs';

    const clientConfig: Record<string, any> = { region };
    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>(
      'aws.secretAccessKey',
    );

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    const client = new DynamoDBClient(clientConfig);
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
   * 4. Bản ghi trượt đếm phát hiện Brute-Force nếu là hành động thất bại
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
    const timelinePK = data.userId
      ? `USER#${data.userId}`
      : `IDENTIFIER#${data.identifier.toLowerCase()}`;
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
    const targetPK = `USER#${userId}`;
    const exclusiveStartKey = this.decodeCursor(query.cursor, targetPK);

    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': targetPK,
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

    const exclusiveStartKey = this.decodeCursor(query.cursor, pk);

    // Xây dựng FilterExpression cho các thuộc tính phụ
    const filterExpressions: string[] = [];
    const expressionAttributeValues: Record<string, any> = {
      ':pk': pk,
      ':skPrefix': skPrefix,
    };
    const expressionAttributeNames: Record<string, string> = {};

    if (query.category) {
      filterExpressions.push('#category = :category');
      expressionAttributeNames['#category'] = 'category';
      expressionAttributeValues[':category'] = query.category;
    }

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
      FilterExpression:
        filterExpressions.length > 0
          ? filterExpressions.join(' AND ')
          : undefined,
      ExpressionAttributeNames:
        Object.keys(expressionAttributeNames).length > 0
          ? expressionAttributeNames
          : undefined,
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
    const sinceTimestamp = new Date(
      Date.now() - windowMinutes * 60 * 1000,
    ).toISOString();

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

  private decodeCursor(
    cursor?: string,
    expectedPK?: string,
  ): Record<string, any> | undefined {
    if (!cursor || cursor.trim() === '') return undefined;
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(cursor, 'base64').toString('utf-8'),
      );
      if (typeof parsed === 'object' && parsed !== null) {
        const key = parsed as Record<string, any>;
        if (typeof key.PK !== 'string' || typeof key.SK !== 'string') {
          return undefined;
        }
        if (expectedPK && key.PK !== expectedPK) {
          this.logger.warn(
            `Cursor PK không khớp với Partition Key truy vấn: mong đợi "${expectedPK}", nhận được "${key.PK}". Bỏ qua cursor.`,
          );
          return undefined;
        }
        return key;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }
}
