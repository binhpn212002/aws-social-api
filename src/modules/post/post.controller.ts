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
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostService } from './services/post.service';
import { PostLikeService } from './services/post-like.service';
import { GetPostUploadUrlDto } from './dto/get-post-upload-url.dto';
import { UploadPostMediaResponseDto } from './dto/upload-post-media-response.dto';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { GetFeedQueryDto } from './dto/get-feed-query.dto';
import { FeedResponseDto, PostResponseDto } from './dto/post-response.dto';
import { ToggleLikeResponseDto } from './dto/toggle-like-response.dto';

@ApiTags('Posts')
@ApiBearerAuth()
@Controller('posts')
export class PostController {
  constructor(
    private readonly postService: PostService,
    private readonly postLikeService: PostLikeService,
  ) {}

  @Post('media/upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '1. Xin Presigned S3 URL để tải hình ảnh/video đính kèm cho bài viết',
    description:
      'Tạo URL upload trực tiếp lên AWS S3 (PUT) với thời hạn 15 phút. S3 key được phân lập theo người dùng.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tạo upload presigned URL thành công',
    type: UploadPostMediaResponseDto,
  })
  async getUploadUrl(
    @CurrentUser('userId') userId: string,
    @Body() dto: GetPostUploadUrlDto,
  ): Promise<UploadPostMediaResponseDto> {
    return this.postService.generateUploadUrl(userId, dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '2. Tạo bài viết mới' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Tạo bài viết thành công',
    type: PostResponseDto,
  })
  async createPost(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    return this.postService.createPost(userId, dto);
  }

  @Public()
  @Get('feed')
  @ApiOperation({
    summary: '3. Lấy News Feed bài viết theo Cursor Pagination (không bắt buộc đăng nhập)',
    description:
      'Lấy danh sách bài viết trang chủ theo thuật toán quyền riêng tư (PUBLIC khi chưa đăng nhập, hoặc kèm FRIENDS và bài viết chính chủ khi đã đăng nhập).',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy News Feed thành công',
    type: FeedResponseDto,
  })
  async getFeed(
    @CurrentUser('userId') userId: string | null,
    @Query() query: GetFeedQueryDto,
  ): Promise<FeedResponseDto> {
    return this.postService.getNewsFeed(userId, query);
  }

  @Public()
  @Get('user/:userId')
  @ApiOperation({
    summary: '4. Lấy danh sách bài viết trên trang cá nhân của một người dùng',
  })
  @ApiParam({ name: 'userId', description: 'UUID của người dùng cần xem' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy bài viết của user thành công',
    type: FeedResponseDto,
  })
  async getUserTimeline(
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('userId') viewerId: string,
    @Query() query: GetFeedQueryDto,
  ): Promise<FeedResponseDto> {
    return this.postService.getUserTimeline(targetUserId, viewerId, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: '5. Xem chi tiết bài viết (PUBLIC không bắt buộc đăng nhập)' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Lấy chi tiết bài viết thành công',
    type: PostResponseDto,
  })
  async getPostById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') viewerId: string | null,
  ): Promise<PostResponseDto> {
    return this.postService.getPostById(id, viewerId);
  }

  @Patch(':id')
  @ApiOperation({ summary: '6. Chỉnh sửa nội dung & quyền riêng tư bài viết' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cập nhật bài viết thành công',
    type: PostResponseDto,
  })
  async updatePost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    return this.postService.updatePost(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '7. Xóa bài viết (Soft Delete)' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Xóa bài viết thành công',
  })
  async deletePost(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<{ message: string }> {
    return this.postService.deletePost(id, userId);
  }

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '8. Bật / Tắt thích bài viết (Toggle Like)' })
  @ApiParam({ name: 'id', description: 'UUID của bài viết' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Thao tác like/unlike thành công',
    type: ToggleLikeResponseDto,
  })
  async toggleLike(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('userId') userId: string,
  ): Promise<ToggleLikeResponseDto> {
    return this.postLikeService.toggleLike(id, userId);
  }
}
