import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '../interfaces/chat-conversation.interface';
import { MessageType } from '../interfaces/chat-message.interface';

export class UserProfileDto {
  @ApiProperty({ example: '78a9c140-5b43-41bb-aef3-018274cbef01' })
  id: string;

  @ApiProperty({ example: 'nguyenvana' })
  username: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  fullName: string;

  @ApiPropertyOptional({ example: 'https://s3.amazonaws.com/avatar.jpg' })
  avatarUrl?: string | null;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;
}

export class LastMessageSummaryDto {
  @ApiProperty({ example: 'm1a9c140-5b43-41bb-aef3-018274cbef01' })
  id: string;

  @ApiProperty({ example: 'Chào bạn nhé!' })
  content: string;

  @ApiProperty({ enum: MessageType, example: MessageType.TEXT })
  type: MessageType;

  @ApiProperty({ example: '2026-10-03T15:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: UserProfileDto })
  sender: UserProfileDto;
}

export class ConversationResponseDto {
  @ApiProperty({ example: 'c1a9c140-5b43-41bb-aef3-018274cbef55' })
  id: string;

  @ApiProperty({ enum: ConversationType, example: ConversationType.DIRECT })
  type: ConversationType;

  @ApiProperty({ example: 'Nguyễn Văn B' })
  name: string;

  @ApiPropertyOptional({ example: 'https://s3.amazonaws.com/avatar-b.jpg' })
  avatarUrl?: string | null;

  @ApiProperty({ type: [UserProfileDto] })
  members: UserProfileDto[];

  @ApiPropertyOptional({ type: LastMessageSummaryDto })
  lastMessage?: LastMessageSummaryDto;

  @ApiProperty({ example: 0 })
  unreadCount: number;

  @ApiProperty({ example: '2026-10-03T15:00:00.000Z' })
  createdAt: string;

  @ApiProperty({ example: '2026-10-03T15:30:00.000Z' })
  updatedAt: string;
}

export class ConversationListResponseDto {
  @ApiProperty({ type: [ConversationResponseDto] })
  items: ConversationResponseDto[];

  @ApiPropertyOptional({ example: 'eyJpZCI6IjNmYTg1ZjY0LTU3MTctNDU2Mi1iM2ZjLTJjOTYzZjY2YWZhNiJ9' })
  nextCursor?: string | null;
}
