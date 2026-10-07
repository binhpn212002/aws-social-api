import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FriendshipStatus } from '../../../database/entities/friendship.entity';

export type FriendshipDirection = 'outgoing' | 'incoming' | 'none';

export class FriendshipStatusResponseDto {
  @ApiProperty({
    description: 'ID người dùng mục tiêu',
    example: '78a9c140-5b43-41bb-aef3-018274cbef01',
  })
  targetUserId: string;

  @ApiProperty({ description: 'Đã là bạn bè hay chưa', example: true })
  isFriend: boolean;

  @ApiProperty({
    description: 'Trạng thái mối quan hệ hiện tại',
    enum: [...Object.values(FriendshipStatus), 'NONE'],
    example: FriendshipStatus.ACCEPTED,
  })
  status: FriendshipStatus | 'NONE';

  @ApiProperty({
    description:
      'Hướng của lời mời ("outgoing": tôi gửi đi, "incoming": người đó gửi đến tôi, "none": không có)',
    example: 'outgoing',
    enum: ['outgoing', 'incoming', 'none'],
  })
  direction: FriendshipDirection;

  @ApiProperty({
    description: 'Người dùng hiện tại có chặn người này không',
    example: false,
  })
  isBlockedByMe: boolean;

  @ApiProperty({
    description: 'Người dùng hiện tại có bị người này chặn không',
    example: false,
  })
  isBlockedByThem: boolean;

  @ApiPropertyOptional({
    description: 'ID của lời mời kết bạn (nếu đang ở trạng thái PENDING)',
    example: '22e11890-a50d-45db-99e6-012984187211',
  })
  requestId?: string | null;
}
