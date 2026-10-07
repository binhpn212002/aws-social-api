import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { UserService } from '../../user/services/user.service';
import { RedisService } from '../../../integrations/redis/redis.service';
import { ChatConversationRepository } from '../repositories/chat-conversation.repository';
import { ChatMessageRepository } from '../repositories/chat-message.repository';
import { ChatWsService } from './chat-ws.service';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { GetConversationsQueryDto } from '../dto/get-conversations-query.dto';
import { GetMessagesQueryDto } from '../dto/get-messages-query.dto';
import { SendMessageDto } from '../dto/send-message.dto';
import {
  ConversationResponseDto,
  UserProfileDto,
} from '../dto/conversation-response.dto';
import { ChatMessageResponseDto } from '../dto/chat-message-response.dto';
import {
  ConversationType,
  DynamoChatConversation,
} from '../interfaces/chat-conversation.interface';
import {
  DynamoChatMessage,
  MessageType,
} from '../interfaces/chat-message.interface';
import { CHAT_WS_EVENTS } from '../../../common/constants/module.constant';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversationRepo: ChatConversationRepository,
    private readonly messageRepo: ChatMessageRepository,
    private readonly userService: UserService,
    private readonly redisService: RedisService,
    private readonly chatWsService: ChatWsService,
  ) {}

  /**
   * Lấy User Profile kết hợp Cache Redis và PostgreSQL (Hybrid Mapping)
   */
  async getUserProfileMap(userIds: string[]): Promise<Map<string, UserProfileDto>> {
    const profileMap = new Map<string, UserProfileDto>();
    if (!userIds || userIds.length === 0) return profileMap;

    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    const cacheKeys = uniqueIds.map((id) => `user:profile:${id}`);

    // 1. Kiểm tra trong Cache Redis
    const cachedProfiles = await this.redisService.mget(...cacheKeys);
    const missingIds: string[] = [];

    uniqueIds.forEach((id, index) => {
      const cached = cachedProfiles[index];
      if (cached) {
        try {
          profileMap.set(id, JSON.parse(cached));
        } catch {
          missingIds.push(id);
        }
      } else {
        missingIds.push(id);
      }
    });

    // 2. Với các ID còn thiếu, query PostgreSQL
    if (missingIds.length > 0) {
      const users = await this.userService.findByIds(missingIds);
      for (const u of users) {
        const dto: UserProfileDto = {
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          avatarUrl: u.avatarUrl || null,
          status: u.status,
        };
        profileMap.set(u.id, dto);

        // Lưu vào Redis với TTL 1 giờ (3600s)
        await this.redisService.set(
          `user:profile:${u.id}`,
          JSON.stringify(dto),
          3600,
        );
      }
    }

    return profileMap;
  }

  /**
   * Tạo cuộc trò chuyện mới (1-1 hoặc Group)
   */
  async createConversation(
    currentUserId: string,
    dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    const now = new Date().toISOString();

    if (dto.type === ConversationType.DIRECT) {
      if (!dto.recipientId) {
        throw new BadRequestException('recipientId là bắt buộc đối với cuộc hội thoại DIRECT');
      }
      if (dto.recipientId === currentUserId) {
        throw new BadRequestException('Không thể tự tạo cuộc hội thoại với chính mình');
      }

      // Kiểm tra xem hội thoại 1-1 giữa 2 người đã tồn tại chưa
      const existing = await this.conversationRepo.findDirectConversation(
        currentUserId,
        dto.recipientId,
      );
      if (existing) {
        const userMap = await this.getUserProfileMap(existing.memberIds);
        return this.mapConversationToDto(existing, currentUserId, userMap);
      }

      const conversationId = randomUUID();
      const newConv: DynamoChatConversation = {
        id: conversationId,
        type: ConversationType.DIRECT,
        memberIds: [currentUserId, dto.recipientId],
        unreadCounts: {
          [currentUserId]: 0,
          [dto.recipientId]: 0,
        },
        createdBy: currentUserId,
        createdAt: now,
        updatedAt: now,
      };

      await this.conversationRepo.create(newConv);
      const userMap = await this.getUserProfileMap(newConv.memberIds);
      return this.mapConversationToDto(newConv, currentUserId, userMap);
    }

    // GROUP conversation
    const groupMemberIds = Array.from(
      new Set([currentUserId, ...(dto.memberIds || [])]),
    );

    if (groupMemberIds.length < 2) {
      throw new BadRequestException('Nhóm trò chuyện phải có tối thiểu 2 thành viên');
    }

    const unreadCounts: Record<string, number> = {};
    groupMemberIds.forEach((uid) => {
      unreadCounts[uid] = 0;
    });

    const conversationId = randomUUID();
    const newGroupConv: DynamoChatConversation = {
      id: conversationId,
      type: ConversationType.GROUP,
      name: dto.name || 'Nhóm mới',
      avatarUrl: dto.avatarUrl,
      memberIds: groupMemberIds,
      unreadCounts,
      createdBy: currentUserId,
      createdAt: now,
      updatedAt: now,
    };

    await this.conversationRepo.create(newGroupConv);
    const userMap = await this.getUserProfileMap(newGroupConv.memberIds);
    return this.mapConversationToDto(newGroupConv, currentUserId, userMap);
  }

  /**
   * Lấy danh sách hộp thư hội thoại của người dùng
   */
  async getMyConversations(
    currentUserId: string,
    query: GetConversationsQueryDto,
  ): Promise<{ items: ConversationResponseDto[]; nextCursor?: string | null }> {
    const rawConversations = await this.conversationRepo.findByMemberId(
      currentUserId,
      query.limit || 20,
    );

    if (!rawConversations || rawConversations.length === 0) {
      return { items: [], nextCursor: null };
    }

    // Thu thập tất cả userIds xuất hiện trong các hội thoại
    const userIdSet = new Set<string>();
    for (const conv of rawConversations) {
      conv.memberIds?.forEach((id) => userIdSet.add(id));
      if (conv.lastMessage?.userId) {
        userIdSet.add(conv.lastMessage.userId);
      }
    }

    const userMap = await this.getUserProfileMap(Array.from(userIdSet));

    const items = rawConversations.map((conv) =>
      this.mapConversationToDto(conv, currentUserId, userMap),
    );

    return { items, nextCursor: null };
  }

  /**
   * Lấy lịch sử tin nhắn trong cuộc hội thoại (Cursor-based)
   */
  async getConversationMessages(
    conversationId: string,
    currentUserId: string,
    query: GetMessagesQueryDto,
  ): Promise<{ items: ChatMessageResponseDto[]; nextCursor?: string | null }> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    if (!conversation.memberIds.includes(currentUserId)) {
      throw new ForbiddenException('Bạn không phải là thành viên của cuộc hội thoại này');
    }

    const { items: rawMessages, nextCursor } =
      await this.messageRepo.findByConversationId(
        conversationId,
        query.limit || 30,
        query.cursor,
      );

    if (!rawMessages || rawMessages.length === 0) {
      return { items: [], nextCursor: null };
    }

    const senderIds = Array.from(new Set(rawMessages.map((m) => m.userId)));
    const userMap = await this.getUserProfileMap(senderIds);

    const items: ChatMessageResponseDto[] = rawMessages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversationId,
      type: msg.type,
      content: msg.isRecalled ? 'Tin nhắn đã được thu hồi' : msg.content,
      mediaUrl: msg.isRecalled ? undefined : msg.mediaUrl,
      s3Key: msg.isRecalled ? undefined : msg.s3Key,
      fileName: msg.fileName,
      fileSize: msg.fileSize,
      replyToId: msg.replyToId,
      isRecalled: !!msg.isRecalled,
      createdAt: msg.createdAt,
      sender: userMap.get(msg.userId) || {
        id: msg.userId,
        username: 'unknown',
        fullName: 'Người dùng',
        avatarUrl: null,
        status: 'ACTIVE',
      },
    }));

    return { items, nextCursor: nextCursor || null };
  }

  /**
   * Gửi tin nhắn mới (ghi nhận đồng thời vào DynamoDB và broadcast WebSocket)
   */
  async sendMessage(
    currentUserId: string,
    dto: SendMessageDto,
  ): Promise<ChatMessageResponseDto> {
    const conversation = await this.conversationRepo.findById(dto.conversationId);
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    if (!conversation.memberIds.includes(currentUserId)) {
      throw new ForbiddenException('Bạn không có quyền gửi tin nhắn trong hội thoại này');
    }

    const messageId = randomUUID();
    const now = new Date().toISOString();
    const sk = `${now}#${messageId}`;

    const messageItem: DynamoChatMessage = {
      conversationId: dto.conversationId,
      sk,
      id: messageId,
      userId: currentUserId,
      type: dto.type || MessageType.TEXT,
      content: dto.content || '',
      mediaUrl: dto.mediaUrl,
      s3Key: dto.s3Key,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      replyToId: dto.replyToId,
      isRecalled: false,
      createdAt: now,
    };

    const otherMemberIds = conversation.memberIds.filter(
      (id) => id !== currentUserId,
    );

    // Ghi đồng thời vào ChatMessages và ChatConversations qua TransactWrite
    await this.messageRepo.saveMessageWithConversationUpdate(
      messageItem,
      otherMemberIds,
    );

    const userMap = await this.getUserProfileMap([currentUserId]);
    const senderProfile = userMap.get(currentUserId) || {
      id: currentUserId,
      username: 'unknown',
      fullName: 'Người dùng',
      avatarUrl: null,
      status: 'ACTIVE',
    };

    const responseDto: ChatMessageResponseDto = {
      ...messageItem,
      isRecalled: false,
      sender: senderProfile,
    };

    // Đẩy WebSocket Realtime tới các thành viên
    this.chatWsService
      .broadcastToMembers(
        dto.conversationId,
        conversation.memberIds,
        currentUserId,
        {
          event: CHAT_WS_EVENTS.MESSAGE_NEW,
          data: responseDto,
        },
      )
      .catch((err) => {
        this.logger.error('Lỗi khi broadcast WebSocket tin nhắn mới:', err);
      });

    return responseDto;
  }

  /**
   * Đánh dấu đã đọc cuộc hội thoại
   */
  async markAsRead(
    conversationId: string,
    currentUserId: string,
  ): Promise<{ success: boolean; conversationId: string; unreadCount: number }> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Không tìm thấy cuộc hội thoại');
    }

    if (!conversation.memberIds.includes(currentUserId)) {
      throw new ForbiddenException('Bạn không phải là thành viên của cuộc hội thoại này');
    }

    await this.conversationRepo.resetUnreadCount(conversationId, currentUserId);

    // Gửi sự kiện đã đọc cho các thành viên khác
    this.chatWsService
      .broadcastToMembers(
        conversationId,
        conversation.memberIds,
        currentUserId,
        {
          event: CHAT_WS_EVENTS.CONVERSATION_READ,
          data: {
            conversationId,
            userId: currentUserId,
          },
        },
      )
      .catch((err) => {
        this.logger.error('Lỗi khi broadcast WebSocket đã đọc:', err);
      });

    return {
      success: true,
      conversationId,
      unreadCount: 0,
    };
  }

  /**
   * Thu hồi tin nhắn
   */
  async recallMessage(
    conversationId: string,
    messageId: string,
    createdAt: string,
    currentUserId: string,
  ): Promise<{ success: boolean }> {
    const sk = `${createdAt}#${messageId}`;
    const message = await this.messageRepo.findById(conversationId, sk);

    if (!message) {
      throw new NotFoundException('Không tìm thấy tin nhắn');
    }

    if (message.userId !== currentUserId) {
      throw new ForbiddenException('Bạn chỉ có thể thu hồi tin nhắn của chính mình');
    }

    await this.messageRepo.recallMessage(conversationId, sk);
    return { success: true };
  }

  /**
   * Helper mapping item DynamoDB thành DTO Response
   */
  private mapConversationToDto(
    conv: DynamoChatConversation,
    currentUserId: string,
    userMap: Map<string, UserProfileDto>,
  ): ConversationResponseDto {
    const isDirect = conv.type === ConversationType.DIRECT;
    const otherUserId = conv.memberIds.find((id) => id !== currentUserId);
    const otherUser = otherUserId ? userMap.get(otherUserId) : null;

    let displayName = conv.name || '';
    let displayAvatar = conv.avatarUrl || null;

    if (isDirect && otherUser) {
      displayName = otherUser.fullName || otherUser.username;
      displayAvatar = otherUser.avatarUrl || null;
    }

    const members: UserProfileDto[] = conv.memberIds
      .map((id) => userMap.get(id))
      .filter((u): u is UserProfileDto => !!u);

    return {
      id: conv.id,
      type: conv.type,
      name: displayName,
      avatarUrl: displayAvatar,
      members,
      lastMessage: conv.lastMessage
        ? {
            id: conv.lastMessage.id,
            content: conv.lastMessage.content,
            type: (conv.lastMessage.type as MessageType) || MessageType.TEXT,
            createdAt: conv.lastMessage.createdAt,
            sender: userMap.get(conv.lastMessage.userId) || {
              id: conv.lastMessage.userId,
              username: 'unknown',
              fullName: 'Người dùng',
              avatarUrl: null,
              status: 'ACTIVE',
            },
          }
        : undefined,
      unreadCount: conv.unreadCounts?.[currentUserId] || 0,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    };
  }
}
