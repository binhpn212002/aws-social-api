import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoChatMessage } from '../interfaces/chat-message.interface';
import { DYNAMODB_TABLES } from '../../../common/constants/module.constant';

@Injectable()
export class ChatMessageRepository {
  private readonly logger = new Logger(ChatMessageRepository.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly messagesTable: string;
  private readonly conversationsTable: string;

  constructor(private readonly configService: ConfigService) {
    const region =
      this.configService.get<string>('aws.dynamodb.region') ||
      this.configService.get<string>('aws.region') ||
      'ap-southeast-1';

    this.messagesTable =
      this.configService.get<string>('aws.dynamodb.chatMessagesTableName') ||
      DYNAMODB_TABLES.CHAT_MESSAGES;

    this.conversationsTable =
      this.configService.get<string>('aws.dynamodb.chatConversationsTableName') ||
      DYNAMODB_TABLES.CHAT_CONVERSATIONS;

    const clientConfig: Record<string, any> = { region };
    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>('aws.secretAccessKey');

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    const client = new DynamoDBClient(clientConfig);
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async findByConversationId(
    conversationId: string,
    limit = 30,
    cursor?: string,
  ): Promise<{ items: DynamoChatMessage[]; nextCursor?: string }> {
    try {
      let exclusiveStartKey: Record<string, any> | undefined;
      if (cursor) {
        try {
          exclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
        } catch {
          this.logger.warn(`Cursor không hợp lệ: ${cursor}`);
        }
      }

      const result = await this.docClient.send(
        new QueryCommand({
          TableName: this.messagesTable,
          KeyConditionExpression: 'conversationId = :cid',
          ExpressionAttributeValues: {
            ':cid': conversationId,
          },
          ScanIndexForward: false, // Lấy tin nhắn mới nhất lên đầu
          Limit: limit,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      const items = (result.Items as DynamoChatMessage[]) || [];
      const nextCursor = result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined;

      return { items, nextCursor };
    } catch (error) {
      this.logger.error(`Lỗi findByConversationId conversation ${conversationId}:`, error);
      throw error;
    }
  }

  async findById(conversationId: string, sk: string): Promise<DynamoChatMessage | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.messagesTable,
          Key: { conversationId, sk },
        }),
      );
      return (result.Item as DynamoChatMessage) || null;
    } catch (error) {
      this.logger.error(`Lỗi findById message conversation ${conversationId}, sk ${sk}:`, error);
      throw error;
    }
  }

  async saveMessageWithConversationUpdate(
    message: DynamoChatMessage,
    recipientIds: string[],
  ): Promise<void> {
    const now = message.createdAt;

    let updateExpression = 'SET lastMessage = :lm, lastMessageAt = :lmat, updatedAt = :now';
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {
      ':lm': {
        id: message.id,
        userId: message.userId,
        content: message.content || '',
        type: message.type,
        createdAt: now,
      },
      ':lmat': now,
      ':now': now,
      ':one': 1,
    };

    recipientIds.forEach((uid, index) => {
      const alias = `#u_${index}`;
      expressionAttributeNames[alias] = uid;
      updateExpression += `, unreadCounts.${alias} = if_not_exists(unreadCounts.${alias}, :zero) + :one`;
    });

    if (recipientIds.length > 0) {
      expressionAttributeValues[':zero'] = 0;
    }

    try {
      await this.docClient.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.messagesTable,
                Item: message,
              },
            },
            {
              Update: {
                TableName: this.conversationsTable,
                Key: { id: message.conversationId },
                UpdateExpression: updateExpression,
                ExpressionAttributeNames:
                  Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
                ExpressionAttributeValues: expressionAttributeValues,
              },
            },
          ],
        }),
      );
    } catch (error) {
      this.logger.error('Lỗi TransactWriteCommand saveMessageWithConversationUpdate:', error);
      throw error;
    }
  }

  async recallMessage(conversationId: string, sk: string): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.messagesTable,
          Key: { conversationId, sk },
          UpdateExpression: 'SET isRecalled = :recalled, content = :recalledContent REMOVE mediaUrl, s3Key',
          ExpressionAttributeValues: {
            ':recalled': true,
            ':recalledContent': 'Tin nhắn đã được thu hồi',
          },
        }),
      );
    } catch (error) {
      this.logger.error(`Lỗi recallMessage conversation ${conversationId}, sk ${sk}:`, error);
      throw error;
    }
  }
}
