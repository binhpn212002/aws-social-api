import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './services/chat.service';
import { ChatMediaService } from './services/chat-media.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { GetConversationsQueryDto } from './dto/get-conversations-query.dto';
import { GetMessagesQueryDto } from './dto/get-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UploadMediaUrlDto } from './dto/upload-media-url.dto';
import {
  ConversationListResponseDto,
  ConversationResponseDto,
} from './dto/conversation-response.dto';
import {
  ChatMessageListResponseDto,
  ChatMessageResponseDto,
} from './dto/chat-message-response.dto';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatMediaService: ChatMediaService,
  ) {}

  @Post('media/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy Presigned URL để upload media (ảnh, video, audio, file) lên AWS S3',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tạo URL thành công',
  })
  async getUploadUrl(@Body() dto: UploadMediaUrlDto) {
    return this.chatMediaService.generatePresignedUploadUrl(dto);
  }

  @Post('conversations')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Tạo cuộc hội thoại mới (1-1 hoặc Nhóm)',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: ConversationResponseDto,
  })
  async createConversation(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationResponseDto> {
    return this.chatService.createConversation(userId, dto);
  }

  @Get('conversations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy danh sách hộp thư hội thoại của người dùng (Hybrid DynamoDB + Postgres)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ConversationListResponseDto,
  })
  async getMyConversations(
    @CurrentUser('id') userId: string,
    @Query() query: GetConversationsQueryDto,
  ): Promise<ConversationListResponseDto> {
    return this.chatService.getMyConversations(userId, query);
  }

  @Get('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy lịch sử tin nhắn trong cuộc hội thoại (Cursor-based pagination)',
  })
  @ApiParam({ name: 'id', description: 'UUID cuộc hội thoại' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ChatMessageListResponseDto,
  })
  async getConversationMessages(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @CurrentUser('id') userId: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<ChatMessageListResponseDto> {
    return this.chatService.getConversationMessages(
      conversationId,
      userId,
      query,
    );
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Gửi tin nhắn qua REST API (Hỗ trợ fallback khi không dùng WebSocket)',
  })
  @ApiParam({ name: 'id', description: 'UUID cuộc hội thoại' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: ChatMessageResponseDto,
  })
  async sendMessage(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatMessageResponseDto> {
    dto.conversationId = conversationId;
    return this.chatService.sendMessage(userId, dto);
  }

  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đánh dấu đã đọc cuộc hội thoại (Reset unread count)',
  })
  @ApiParam({ name: 'id', description: 'UUID cuộc hội thoại' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đánh dấu đã đọc thành công',
  })
  async markAsRead(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.markAsRead(conversationId, userId);
  }

  @Delete('conversations/:id/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thu hồi tin nhắn',
  })
  @ApiParam({ name: 'id', description: 'UUID cuộc hội thoại' })
  @ApiParam({ name: 'messageId', description: 'UUID tin nhắn cần thu hồi' })
  async recallMessage(
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Query('createdAt') createdAt: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.recallMessage(
      conversationId,
      messageId,
      createdAt,
      userId,
    );
  }
}
