import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { ConversationType, DynamoChatConversation } from '../interfaces/chat-conversation.interface';
import { DYNAMODB_TABLES } from '../../../common/constants/module.constant';

@Injectable()
export class ChatConversationRepository {
  private readonly logger = new Logger(ChatConversationRepository.name);
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(private readonly configService: ConfigService) {
    const region =
      this.configService.get<string>('aws.dynamodb.region') ||
      this.configService.get<string>('aws.region') ||
      'ap-southeast-1';

    this.tableName =
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

  async findById(id: string): Promise<DynamoChatConversation | null> {
    try {
      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { id },
        }),
      );
      return (result.Item as DynamoChatConversation) || null;
    } catch (error) {
      this.logger.error(`Lỗi findById conversation ${id}:`, error);
      throw error;
    }
  }

  async create(conversation: DynamoChatConversation): Promise<void> {
    try {
      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: conversation,
        }),
      );
    } catch (error) {
      this.logger.error('Lỗi create conversation:', error);
      throw error;
    }
  }

  async findByMemberId(userId: string, limit = 20): Promise<DynamoChatConversation[]> {
    try {
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'contains(memberIds, :userId)',
          ExpressionAttributeValues: {
            ':userId': userId,
          },
          Limit: 100, // Quét 100 bản ghi mới nhất để lọc
        }),
      );

      const items = (result.Items as DynamoChatConversation[]) || [];
      // Sắp xếp in-memory theo lastMessageAt hoặc updatedAt giảm dần
      items.sort((a, b) => {
        const timeA = a.lastMessageAt || a.updatedAt || a.createdAt;
        const timeB = b.lastMessageAt || b.updatedAt || b.createdAt;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });

      return items.slice(0, limit);
    } catch (error) {
      this.logger.error(`Lỗi findByMemberId userId ${userId}:`, error);
      throw error;
    }
  }

  async findDirectConversation(userAId: string, userBId: string): Promise<DynamoChatConversation | null> {
    try {
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: '#type = :direct AND contains(memberIds, :userA) AND contains(memberIds, :userB)',
          ExpressionAttributeNames: {
            '#type': 'type',
          },
          ExpressionAttributeValues: {
            ':direct': ConversationType.DIRECT,
            ':userA': userAId,
            ':userB': userBId,
          },
          Limit: 20,
        }),
      );

      const items = (result.Items as DynamoChatConversation[]) || [];
      // Đảm bảo là DIRECT và có đúng 2 thành viên là userA và userB
      const found = items.find(
        (c) =>
          c.type === ConversationType.DIRECT &&
          c.memberIds.length === 2 &&
          c.memberIds.includes(userAId) &&
          c.memberIds.includes(userBId),
      );

      return found || null;
    } catch (error) {
      this.logger.error(`Lỗi findDirectConversation giữa ${userAId} và ${userBId}:`, error);
      throw error;
    }
  }

  async resetUnreadCount(conversationId: string, userId: string): Promise<void> {
    try {
      await this.docClient.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id: conversationId },
          UpdateExpression: 'SET unreadCounts.#userId = :zero, updatedAt = :now',
          ExpressionAttributeNames: {
            '#userId': userId,
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':now': new Date().toISOString(),
          },
        }),
      );
    } catch (error) {
      this.logger.error(`Lỗi resetUnreadCount conversation ${conversationId}, user ${userId}:`, error);
      throw error;
    }
  }
}
