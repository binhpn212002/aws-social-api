import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { S3Service } from '../../../integrations/storage/s3.service';
import { UploadMediaUrlDto } from '../dto/upload-media-url.dto';
import { CHAT_MEDIA_LIMITS } from '../../../common/constants/module.constant';

@Injectable()
export class ChatMediaService {
  private readonly logger = new Logger(ChatMediaService.name);

  constructor(private readonly s3Service: S3Service) {}

  async generatePresignedUploadUrl(dto: UploadMediaUrlDto) {
    const { conversationId, fileName, contentType, fileSize } = dto;

    this.validateMedia(contentType, fileSize);

    // Chuẩn hóa tên file và sinh S3 key
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileId = randomUUID();
    const s3Key = `chat/${conversationId}/${fileId}-${sanitizedFileName}`;

    const expiresInSeconds = 900; // 15 phút
    const uploadUrl = await this.s3Service.getPresignedPutUrl(
      s3Key,
      contentType,
      expiresInSeconds,
    );
    const publicUrl = this.s3Service.getFileUrl(s3Key);

    return {
      uploadUrl,
      s3Key,
      publicUrl,
      expiresInSeconds,
    };
  }

  private validateMedia(contentType: string, fileSize: number): void {
    const mime = contentType.toLowerCase();

    if (mime.startsWith('image/')) {
      if (fileSize > CHAT_MEDIA_LIMITS.IMAGE_MAX_SIZE) {
        throw new BadRequestException('Ảnh không được vượt quá 10MB');
      }
    } else if (mime.startsWith('video/')) {
      if (fileSize > CHAT_MEDIA_LIMITS.VIDEO_MAX_SIZE) {
        throw new BadRequestException('Video không được vượt quá 50MB');
      }
    } else if (mime.startsWith('audio/')) {
      if (fileSize > CHAT_MEDIA_LIMITS.AUDIO_MAX_SIZE) {
        throw new BadRequestException('Audio không được vượt quá 15MB');
      }
    } else {
      // Các loại tài liệu khác (pdf, doc, zip, ...)
      if (fileSize > CHAT_MEDIA_LIMITS.FILE_MAX_SIZE) {
        throw new BadRequestException('Tệp đính kèm không được vượt quá 25MB');
      }
    }
  }
}
