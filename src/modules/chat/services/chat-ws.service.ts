import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { RedisService } from '../../../integrations/redis/redis.service';

@Injectable()
export class ChatWsService {
  private readonly logger = new Logger(ChatWsService.name);
  private readonly apiGwClient?: ApiGatewayManagementApiClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    const endpoint =
      this.configService.get<string>('aws.websocket.managementEndpoint') ||
      this.configService.get<string>('aws.websocket.endpoint');

    if (endpoint) {
      const region =
        this.configService.get<string>('aws.region') || 'ap-southeast-1';
      this.apiGwClient = new ApiGatewayManagementApiClient({
        endpoint,
        region,
      });
    } else {
      this.logger.warn('AWS WebSocket endpoint chưa được cấu hình. Push realtime sẽ bị bỏ qua.');
    }
  }

  private getUserConnectionKey(userId: string): string {
    return `ws:user:${userId}:connections`;
  }

  async registerConnection(userId: string, connectionId: string): Promise<void> {
    const key = this.getUserConnectionKey(userId);
    await this.redisService.sadd(key, connectionId);
  }

  async removeConnection(userId: string, connectionId: string): Promise<void> {
    const key = this.getUserConnectionKey(userId);
    await this.redisService.srem(key, connectionId);
  }

  async getUserConnections(userId: string): Promise<string[]> {
    const key = this.getUserConnectionKey(userId);
    return this.redisService.smembers(key);
  }

  async sendToConnection(
    connectionId: string,
    payload: any,
    userId?: string,
  ): Promise<boolean> {
    if (!this.apiGwClient) return false;

    try {
      await this.apiGwClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: Buffer.from(JSON.stringify(payload)),
        }),
      );
      return true;
    } catch (error: any) {
      // HTTP 410 GoneException: Client đã ngắt kết nối
      if (error?.name === 'GoneException' || error?.$metadata?.httpStatusCode === 410) {
        this.logger.log(`Connection ${connectionId} đã hết hạn (410 Gone), dọn dẹp khỏi Redis.`);
        if (userId) {
          await this.removeConnection(userId, connectionId);
        }
      } else {
        this.logger.error(`Lỗi gửi WebSocket tới connection ${connectionId}:`, error);
      }
      return false;
    }
  }

  async sendToUser(userId: string, payload: any): Promise<void> {
    const connections = await this.getUserConnections(userId);
    if (!connections || connections.length === 0) return;

    await Promise.allSettled(
      connections.map((connId) => this.sendToConnection(connId, payload, userId)),
    );
  }

  async broadcastToMembers(
    conversationId: string,
    memberIds: string[],
    senderId: string,
    payload: any,
  ): Promise<void> {
    // Gửi tới tất cả các thành viên (ngoại trừ người gửi nếu cần, hoặc gửi tất cả)
    const targetMembers = memberIds.filter((id) => id !== senderId);

    await Promise.allSettled(
      targetMembers.map((memberId) => this.sendToUser(memberId, payload)),
    );
  }
}
