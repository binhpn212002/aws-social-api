import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './services/user.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Lấy thông tin profile người dùng kèm thống kê' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy thông tin profile thành công',
  })
  async getUserProfile(
    @Param('id') id: string,
    @CurrentUser('id') currentUserId?: string,
  ) {
    const targetId = id === 'me' ? currentUserId : id;
    if (!targetId) {
      throw new UnauthorizedException('Vui lòng đăng nhập để xem thông tin');
    }
    return this.userService.getProfileWithStats(targetId);
  }

  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin profile cá nhân' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật profile thành công',
  })
  async updateProfile(
    @CurrentUser('id') currentUserId: string,
    @Body() body: { fullName?: string; bio?: string; avatarUrl?: string },
  ) {
    if (!currentUserId) {
      throw new UnauthorizedException('Vui lòng đăng nhập');
    }
    return this.userService.updateProfile(currentUserId, body);
  }
}
