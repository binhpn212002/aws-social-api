import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FriendUserItemDto {
  @ApiProperty({
    description: 'ID người dùng (bạn bè)',
    example: '78a9c140-5b43-41bb-aef3-018274cbef01',
  })
  id: string;

  @ApiProperty({ description: 'Tên tài khoản người dùng', example: 'user_b' })
  username: string;

  @ApiProperty({ description: 'Họ và tên đầy đủ', example: 'Trần Thị B' })
  fullName: string;

  @ApiPropertyOptional({
    description: 'Ảnh đại diện người dùng',
    example: 'https://cdn.social.com/avatars/user_b.jpg',
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    description: 'Tiểu sử cá nhân',
    example: 'Lập trình viên yêu thích công nghệ',
  })
  bio?: string | null;

  @ApiProperty({
    description: 'ID bản ghi quan hệ bạn bè',
    example: '22e11890-a50d-45db-99e6-012984187211',
  })
  friendshipId: string;

  @ApiProperty({
    description: 'Thời điểm bắt đầu trở thành bạn bè',
    example: '2026-10-02T17:35:00.000Z',
  })
  friendshipSince: Date;
}

export class PaginationMetaDto {
  @ApiProperty({ example: 45 })
  totalItems: number;

  @ApiProperty({ example: 1 })
  currentPage: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class FriendListResponseDto {
  @ApiProperty({ type: [FriendUserItemDto] })
  items: FriendUserItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
