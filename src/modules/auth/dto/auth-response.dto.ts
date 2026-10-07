import { ApiProperty } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../database/entities/user.entity';

export class TokenDto {
  @ApiProperty({
    example: 'eyJhbGciOi...',
    description: 'JWT Access Token dùng cho các request tiếp theo',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOi...',
    description: 'Refresh Token dùng để cấp mới access token',
  })
  refreshToken: string;

  @ApiProperty({
    example: 900,
    description: 'Thời gian hết hạn tính bằng giây (15 phút)',
  })
  expiresIn: number;
}

export class UserProfileDto {
  @ApiProperty({ example: 'b6a82741-2cbe-4c4f-a9cb-b61005d58ff3' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'nguyenvana' })
  username: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  fullName: string;

  @ApiProperty({ example: null, nullable: true })
  avatarUrl?: string | null;

  @ApiProperty({ example: null, nullable: true })
  bio?: string | null;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role: UserRole;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status: UserStatus;

  @ApiProperty()
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({ type: () => UserProfileDto })
  user: UserProfileDto;

  @ApiProperty({ type: () => TokenDto })
  tokens: TokenDto;
}
