import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FriendshipStatus } from '../../../database/entities/friendship.entity';
import { PaginationMetaDto } from './friend-user-response.dto';

export class UserSummaryDto {
  @ApiProperty({ example: '78a9c140-5b43-41bb-aef3-018274cbef01' })
  id: string;

  @ApiProperty({ example: 'user_b' })
  username: string;

  @ApiProperty({ example: 'Trần Thị B' })
  fullName: string;

  @ApiPropertyOptional({
    example: 'https://cdn.social.com/avatars/user_b.jpg',
  })
  avatarUrl?: string | null;
}

export class FriendshipResponseDto {
  @ApiProperty({ example: '22e11890-a50d-45db-99e6-012984187211' })
  id: string;

  @ApiProperty({ example: 'b6a82741-2cbe-4c4f-a9cb-b61005d58ff3' })
  requesterId: string;

  @ApiProperty({ example: '78a9c140-5b43-41bb-aef3-018274cbef01' })
  addresseeId: string;

  @ApiProperty({ enum: FriendshipStatus, example: FriendshipStatus.PENDING })
  status: FriendshipStatus;

  @ApiPropertyOptional({ type: UserSummaryDto })
  requester?: UserSummaryDto;

  @ApiPropertyOptional({ type: UserSummaryDto })
  addressee?: UserSummaryDto;

  @ApiProperty({ example: '2026-10-02T17:30:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-10-02T17:30:00.000Z' })
  updatedAt: Date;
}

export class FriendRequestListResponseDto {
  @ApiProperty({ type: [FriendshipResponseDto] })
  items: FriendshipResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
