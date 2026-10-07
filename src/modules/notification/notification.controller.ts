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
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InternalApiGuard } from '../../common/guards/internal-api.guard';
import { PaginationQueryDto } from '../../common/utils/pagination.dto';
import { NotificationService } from './services/notification.service';
import { ScheduledNotificationService } from './services/scheduled-notification.service';
import { GetNotificationsQueryDto } from './dto/get-notifications-query.dto';
import { CreateScheduledNotificationDto } from './dto/create-scheduled-notification.dto';
import { NotifyCompletedDto } from './dto/notify-completed.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { ScheduledNotificationResponseDto } from './dto/scheduled-notification-response.dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly scheduledService: ScheduledNotificationService,
  ) {}

  // ---------------------------------------------------------
  // 1. NHÓM API THÔNG BÁO THƯỜNG
  // ---------------------------------------------------------

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách thông báo của người dùng hiện tại (hỗ trợ phân trang, lọc)' })
  @ApiResponse({ status: 200, description: 'Danh sách thông báo thành công' })
  async getNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: GetNotificationsQueryDto,
  ) {
    return this.notificationService.getNotifications(userId, query);
  }

  @Patch(':id/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đánh dấu một thông báo là đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đọc thành công' })
  async markAsRead(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.notificationService.markAsRead(id, userId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Đã đánh dấu thông báo là đã đọc',
    };
  }

  @Patch('read-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Đánh dấu tất cả thông báo của người dùng là đã đọc' })
  @ApiResponse({ status: 200, description: 'Đã đánh dấu tất cả thành công' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    const count = await this.notificationService.markAllAsRead(userId);
    return {
      statusCode: HttpStatus.OK,
      message: `Đã đánh dấu ${count} thông báo là đã đọc`,
    };
  }

  // ---------------------------------------------------------
  // 2. API CALLBACK TỪ LAMBDA WORKER (NOTIFY-COMPLETED)
  // ---------------------------------------------------------

  @Post('notify-completed')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalApiGuard)
  @ApiHeader({
    name: 'x-internal-api-key',
    description: 'Mã xác thực gọi nội bộ từ AWS Lambda Worker',
    required: true,
  })
  @ApiOperation({
    summary: 'Webhook/Callback API dành riêng cho AWS Lambda Worker cập nhật trạng thái đã gửi thông báo',
  })
  @ApiResponse({ status: 200, description: 'Cập nhật trạng thái thông báo thành công' })
  @ApiResponse({ status: 401, description: 'Không có quyền truy cập nội bộ' })
  async notifyCompleted(@Body() dto: NotifyCompletedDto) {
    if (dto.notificationId) {
      await this.notificationService.markNotificationCompleted(dto);
    }

    if (dto.scheduleId) {
      await this.scheduledService.completeSchedule(dto);
    }

    return {
      statusCode: HttpStatus.OK,
      message: 'Cập nhật trạng thái thông báo thành công',
      data: {
        id: dto.notificationId || dto.scheduleId,
        status: dto.status,
        sentAt: dto.sentAt,
      },
    };
  }

  // ---------------------------------------------------------
  // 3. NHÓM API LẬP LỊCH THÔNG BÁO CHO BẠN BÈ
  // ---------------------------------------------------------

  @Post('schedules')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo một lịch hẹn gửi thông báo cho bạn bè vào thời điểm xác định' })
  @ApiResponse({ status: 201, description: 'Tạo lịch hẹn thành công', type: ScheduledNotificationResponseDto })
  async createSchedule(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateScheduledNotificationDto,
  ) {
    const data = await this.scheduledService.createSchedule(userId, dto);
    return {
      statusCode: HttpStatus.CREATED,
      data,
    };
  }

  @Get('schedules')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách các lịch thông báo do người dùng hiện tại đã tạo' })
  @ApiResponse({ status: 200, description: 'Danh sách lịch hẹn' })
  async listSchedules(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    const data = await this.scheduledService.listSchedules(userId, query);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Delete('schedules/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hủy bỏ lịch hẹn thông báo trước khi nó kích hoạt' })
  @ApiResponse({ status: 200, description: 'Hủy lịch hẹn thành công' })
  async cancelSchedule(
    @CurrentUser('id') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) scheduleId: string,
  ) {
    await this.scheduledService.cancelSchedule(userId, scheduleId);
    return {
      statusCode: HttpStatus.OK,
      message: 'Hủy lịch hẹn thông báo thành công',
    };
  }
}
