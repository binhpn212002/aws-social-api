import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { FriendService } from './services/friend.service';
import { SendFriendRequestDto } from './dto/send-friend-request.dto';
import { GetFriendsQueryDto } from './dto/get-friends-query.dto';
import { GetFriendRequestsQueryDto } from './dto/get-friend-requests-query.dto';
import { GetBlockedUsersQueryDto } from './dto/get-blocked-users-query.dto';
import {
  FriendshipResponseDto,
  FriendRequestListResponseDto,
} from './dto/friendship-response.dto';
import { FriendListResponseDto } from './dto/friend-user-response.dto';
import { FriendshipStatusResponseDto } from './dto/friendship-status-response.dto';

@ApiTags('Friends')
@ApiBearerAuth()
@Controller('friends')
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Gửi lời mời kết bạn tới người dùng khác' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Đã gửi lời mời kết bạn thành công',
    type: FriendshipResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Yêu cầu không hợp lệ hoặc đã gửi trước đó',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Hai người đã là bạn bè',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy người nhận',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Bị chặn không thể gửi lời mời',
  })
  async sendRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: SendFriendRequestDto,
  ): Promise<FriendshipResponseDto> {
    return this.friendService.sendFriendRequest(userId, dto);
  }

  @Patch('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chấp nhận lời mời kết bạn' })
  @ApiParam({
    name: 'id',
    description: 'ID của lời mời kết bạn (Friendship UUID)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chấp nhận lời mời thành công',
    type: FriendshipResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy lời mời',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không có quyền chấp nhận lời mời này',
  })
  async acceptRequest(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<FriendshipResponseDto> {
    return this.friendService.acceptFriendRequest(userId, requestId);
  }

  @Patch('requests/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối lời mời kết bạn' })
  @ApiParam({ name: 'id', description: 'ID của lời mời kết bạn' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Từ chối lời mời thành công',
    type: FriendshipResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy lời mời',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không có quyền từ chối lời mời này',
  })
  async declineRequest(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<FriendshipResponseDto> {
    return this.friendService.declineFriendRequest(userId, requestId);
  }

  @Delete('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy lời mời kết bạn đã gửi đi' })
  @ApiParam({ name: 'id', description: 'ID của lời mời kết bạn' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Đã hủy lời mời kết bạn' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy lời mời',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Không có quyền hủy lời mời này',
  })
  async cancelRequest(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) requestId: string,
  ): Promise<{ message: string }> {
    return this.friendService.cancelFriendRequest(userId, requestId);
  }

  @Get('requests')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lấy danh sách lời mời kết bạn (received: nhận được, sent: đã gửi)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách lời mời kết bạn',
    type: FriendRequestListResponseDto,
  })
  async getFriendRequests(
    @CurrentUser('id') userId: string,
    @Query() query: GetFriendRequestsQueryDto,
  ): Promise<FriendRequestListResponseDto> {
    return this.friendService.getFriendRequests(userId, query);
  }

  @Get('blocks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lấy danh sách người dùng đang bị chặn' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách người dùng bị chặn',
    type: FriendRequestListResponseDto,
  })
  async getBlockedUsers(
    @CurrentUser('id') userId: string,
    @Query() query: GetBlockedUsersQueryDto,
  ): Promise<FriendRequestListResponseDto> {
    return this.friendService.getBlockedUsers(userId, query);
  }

  @Public()
  @Get('status/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra trạng thái quan hệ bạn bè với một người dùng cụ thể',
  })
  @ApiParam({
    name: 'userId',
    description: 'UUID của người dùng cần kiểm tra',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Trạng thái mối quan hệ giữa 2 người',
    type: FriendshipStatusResponseDto,
  })
  async getStatus(
    @CurrentUser('id') currentUserId: string | null,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<FriendshipStatusResponseDto> {
    if (!currentUserId) {
      return {
        targetUserId,
        isFriend: false,
        status: 'NONE',
        direction: 'none',
        isBlockedByMe: false,
        isBlockedByThem: false,
      };
    }
    return this.friendService.getFriendshipStatus(currentUserId, targetUserId);
  }

  @Post('block/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chặn một người dùng (hủy bạn bè, chặn liên lạc và xem nội dung)',
  })
  @ApiParam({ name: 'userId', description: 'UUID người dùng muốn chặn' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Chặn người dùng thành công',
    type: FriendshipResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Không thể chặn chính mình hoặc đã chặn',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy người dùng',
  })
  async blockUser(
    @CurrentUser('id') userId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<FriendshipResponseDto> {
    return this.friendService.blockUser(userId, targetUserId);
  }

  @Delete('block/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bỏ chặn một người dùng' })
  @ApiParam({ name: 'userId', description: 'UUID người dùng muốn bỏ chặn' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đã bỏ chặn người dùng thành công',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Người dùng không nằm trong danh sách bị chặn',
  })
  async unblockUser(
    @CurrentUser('id') userId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
  ): Promise<{ message: string }> {
    return this.friendService.unblockUser(userId, targetUserId);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lấy danh sách bạn bè hiện tại (kèm tìm kiếm họ tên/username & phân trang)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Danh sách bạn bè',
    type: FriendListResponseDto,
  })
  async getFriends(
    @CurrentUser('id') userId: string,
    @Query() query: GetFriendsQueryDto,
  ): Promise<FriendListResponseDto> {
    return this.friendService.getFriends(userId, query);
  }

  @Delete(':friendUserId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hủy kết bạn (Unfriend) với một người dùng' })
  @ApiParam({
    name: 'friendUserId',
    description: 'UUID của người bạn muốn hủy quan hệ',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Đã hủy kết bạn thành công',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy quan hệ bạn bè',
  })
  async unfriend(
    @CurrentUser('id') userId: string,
    @Param('friendUserId', ParseUUIDPipe) friendUserId: string,
  ): Promise<{ message: string }> {
    return this.friendService.unfriend(userId, friendUserId);
  }
}
