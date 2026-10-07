import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageType } from '../interfaces/chat-message.interface';
import { UserProfileDto } from './conversation-response.dto';

export class ChatMessageResponseDto {
  @ApiProperty({ example: 'm1a9c140-5b43-41bb-aef3-018274cbef01' })
  id: string;

  @ApiProperty({ example: 'c1a9c140-5b43-41bb-aef3-018274cbef55' })
  conversationId: string;

  @ApiProperty({ enum: MessageType, example: MessageType.TEXT })
  type: MessageType;

  @ApiProperty({ example: 'Chào bạn nhé!' })
  content: string;

  @ApiPropertyOptional({ example: 'https://s3.amazonaws.com/chat/photo.jpg' })
  mediaUrl?: string;

  @ApiPropertyOptional({ example: 'chat/c1/photo.jpg' })
  s3Key?: string;

  @ApiPropertyOptional({ example: 'photo.jpg' })
  fileName?: string;

  @ApiPropertyOptional({ example: 1048576 })
  fileSize?: number;

  @ApiPropertyOptional({ example: '8fa85f64-5717-4562-b3fc-2c963f66af99' })
  replyToId?: string;

  @ApiProperty({ example: false })
  isRecalled: boolean;

  @ApiProperty({ example: '2026-10-03T15:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: UserProfileDto })
  sender: UserProfileDto;
}

export class ChatMessageListResponseDto {
  @ApiProperty({ type: [ChatMessageResponseDto] })
  items: ChatMessageResponseDto[];

  @ApiPropertyOptional({ example: 'eyJjb252ZXJzYXRpb25JZCI6IjNmYTg1ZjY0In0=' })
  nextCursor?: string | null;
}
