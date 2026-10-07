import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { S3Service } from '../../../integrations/storage/s3.service';
import { GetUploadUrlDto } from '../dto/get-upload-url.dto';
import { GetDownloadUrlDto } from '../dto/get-download-url.dto';
import { UploadUrlResponseDto } from '../dto/upload-url-response.dto';
import { DownloadUrlResponseDto } from '../dto/download-url-response.dto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(private readonly s3Service: S3Service) {}

  /**
   * Tạo Presigned URL để client thực hiện PUT upload file trực tiếp lên S3
   */
  async generateUploadUrl(dto: GetUploadUrlDto): Promise<UploadUrlResponseDto> {
    const folder = dto.folder
      ? dto.folder.replace(/^\/+|\/+$/g, '')
      : 'uploads';
    const ext = path.extname(dto.fileName).toLowerCase();
    const baseName = path
      .basename(dto.fileName, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueId = randomUUID().slice(0, 8);
    const key = `${folder}/${Date.now()}-${uniqueId}-${baseName}${ext}`;

    const expiresIn = 900; // 15 phút cho upload link

    const uploadUrl = await this.s3Service.getResignUrl(key, 'putObject', {
      contentType: dto.contentType,
      expiresIn,
    });

    const fileUrl = this.s3Service.getFileUrl(key);

    this.logger.log(`Generated upload presigned URL for key: ${key}`);

    return {
      uploadUrl,
      key,
      fileUrl,
      expiresIn,
    };
  }

  /**
   * Tạo Presigned URL để client tải hoặc xem file riêng tư từ S3
   */
  async generateDownloadUrl(
    dto: GetDownloadUrlDto,
  ): Promise<DownloadUrlResponseDto> {
    const expiresIn = dto.expiresIn || 3600; // Mặc định 1 giờ

    const downloadUrl = await this.s3Service.getResignUrl(
      dto.key,
      'getObject',
      {
        expiresIn,
      },
    );

    this.logger.log(`Generated download presigned URL for key: ${dto.key}`);

    return {
      downloadUrl,
      key: dto.key,
      expiresIn,
    };
  }

  /**
   * Xóa file khỏi S3
   */
  async deleteMedia(key: string): Promise<void> {
    await this.s3Service.deleteFile(key);
    this.logger.log(`Deleted S3 media key: ${key}`);
  }
}
