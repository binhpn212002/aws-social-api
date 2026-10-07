import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
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
import { AuditLogService } from './services/audit-log.service';
import { GetMyAuditLogsQueryDto } from './dto/get-my-audit-logs-query.dto';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';
import {
  AuditLogDetailResponseDto,
  AuditLogListResponseDto,
} from './dto/audit-log-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xem lịch sử an ninh & hoạt động cá nhân (My Audit Logs)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Danh sách nhật ký bảo mật của người dùng hiện tại từ DynamoDB',
    type: AuditLogListResponseDto,
  })
  async getMyAuditLogs(
    @CurrentUser('sub') userId: string,
    @Query() query: GetMyAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditLogService.getMyAuditLogs(userId, query);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Tra cứu & lọc toàn bộ nhật ký kiểm toán hệ thống từ DynamoDB (Dành riêng cho Admin)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Danh sách nhật ký kiểm toán toàn hệ thống kèm phân trang Cursor và bộ lọc',
    type: AuditLogListResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Từ chối truy cập nếu không phải tài khoản Quản trị viên',
  })
  async getAuditLogs(
    @Query() query: GetAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.auditLogService.getAuditLogsForAdmin(query);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xem chi tiết một bản ghi kiểm toán kèm siêu dữ liệu (Metadata)',
  })
  @ApiParam({ name: 'id', description: 'UUID của bản ghi kiểm toán' })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Thông tin chi tiết bản ghi kiểm toán truy xuất O(1) từ DynamoDB',
    type: AuditLogDetailResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Không tìm thấy bản ghi kiểm toán',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Không có quyền xem bản ghi của người khác nếu không phải Admin',
  })
  async getAuditLogDetail(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: UserRole,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AuditLogDetailResponseDto> {
    const isAdmin = role === UserRole.ADMIN;
    return this.auditLogService.getAuditLogDetail(id, userId, isAdmin);
  }
}
