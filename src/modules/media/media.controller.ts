import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MediaService } from './services/media.service';
import { GetUploadUrlDto } from './dto/get-upload-url.dto';
import { GetDownloadUrlDto } from './dto/get-download-url.dto';
import { UploadUrlResponseDto } from './dto/upload-url-response.dto';
import { DownloadUrlResponseDto } from './dto/download-url-response.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Public()
  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Lấy Presigned URL để upload file trực tiếp lên S3',
    description:
      'Trả về một presigned URL (HTTP PUT). Client dùng URL này cùng header Content-Type tương ứng để tải file trực tiếp lên S3.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tạo presigned upload URL thành công',
    type: UploadUrlResponseDto,
  })
  async getUploadUrl(
    @Body() dto: GetUploadUrlDto,
  ): Promise<UploadUrlResponseDto> {
    return this.mediaService.generateUploadUrl(dto);
  }

  @Public()
  @Get('download-url')
  @ApiOperation({
    summary: 'Lấy Presigned URL để tải hoặc xem file riêng tư từ S3',
    description:
      'Trả về một presigned URL (HTTP GET) có thời hạn để client tải hoặc render file.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Tạo presigned download URL thành công',
    type: DownloadUrlResponseDto,
  })
  async getDownloadUrl(
    @Query() dto: GetDownloadUrlDto,
  ): Promise<DownloadUrlResponseDto> {
    return this.mediaService.generateDownloadUrl(dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Xóa một file khỏi S3 theo key' })
  @ApiQuery({ name: 'key', required: true, description: 'S3 Object Key' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Xóa file thành công',
  })
  async deleteMedia(@Query('key') key: string): Promise<{ message: string }> {
    await this.mediaService.deleteMedia(key);
    return { message: `File with key "${key}" deleted successfully` };
  }
}
