import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUrlOptions {
  expiresIn?: number; // seconds, default: 3600 (1 hour)
  contentType?: string;
  bucket?: string;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly defaultBucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>(
      'aws.s3.region',
      'ap-southeast-1',
    );
    this.defaultBucket = this.configService.get<string>(
      'aws.s3.bucketName',
      'social-bucket-366518187546',
    );

    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>(
      'aws.secretAccessKey',
    );

    this.s3Client = new S3Client({
      region: this.region,
      ...(accessKeyId && secretAccessKey
        ? {
            credentials: {
              accessKeyId,
              secretAccessKey,
            },
          }
        : {}),
    });
  }

  /**
   * Tạo Presigned URL (getResignUrl) để client download hoặc upload trực tiếp lên S3
   * @param key S3 Object key (đường dẫn file)
   * @param action 'putObject' (upload) hoặc 'getObject' (download/view)
   * @param options Các tùy chọn (expiresIn, contentType, bucket)
   */
  async getPresignedUrl(
    key: string,
    action: 'putObject' | 'getObject' = 'getObject',
    options?: PresignedUrlOptions,
  ): Promise<string> {
    const bucket = options?.bucket || this.defaultBucket;
    const expiresIn = options?.expiresIn || 3600;

    try {
      if (action === 'putObject') {
        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: options?.contentType,
        });
        return await getSignedUrl(this.s3Client, command, { expiresIn });
      }

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logger.error(
        `Failed to generate presigned URL for key "${key}" (${action}): ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Alias theo tên yêu cầu: getResignUrl
   */
  async getResignUrl(
    key: string,
    action: 'putObject' | 'getObject' = 'getObject',
    options?: PresignedUrlOptions,
  ): Promise<string> {
    return this.getPresignedUrl(key, action, options);
  }

  /**
   * Tạo URL presigned để client upload file lên S3
   */
  async getPresignedPutUrl(
    key: string,
    contentType?: string,
    expiresIn = 3600,
    bucket?: string,
  ): Promise<string> {
    return this.getPresignedUrl(key, 'putObject', {
      contentType,
      expiresIn,
      bucket,
    });
  }

  /**
   * Tạo URL presigned để client download file từ S3
   */
  async getPresignedGetUrl(
    key: string,
    expiresIn = 3600,
    bucket?: string,
  ): Promise<string> {
    return this.getPresignedUrl(key, 'getObject', {
      expiresIn,
      bucket,
    });
  }

  /**
   * Upload file trực tiếp từ server
   */
  async uploadFile(
    key: string,
    body: Buffer | Uint8Array | string,
    contentType?: string,
    bucket?: string,
  ): Promise<string> {
    const targetBucket = bucket || this.defaultBucket;
    try {
      const command = new PutObjectCommand({
        Bucket: targetBucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      });
      await this.s3Client.send(command);
      return this.getFileUrl(key, targetBucket);
    } catch (error) {
      this.logger.error(
        `Failed to upload file to S3 (${key}): ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Xóa file khỏi S3
   */
  async deleteFile(key: string, bucket?: string): Promise<void> {
    const targetBucket = bucket || this.defaultBucket;
    try {
      const command = new DeleteObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });
      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(
        `Failed to delete file from S3 (${key}): ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Kiểm tra file có tồn tại trên S3 không
   */
  async checkFileExists(key: string, bucket?: string): Promise<boolean> {
    const targetBucket = bucket || this.defaultBucket;
    try {
      const command = new HeadObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Lấy public URL của file trên S3
   */
  getFileUrl(key: string, bucket?: string): string {
    const targetBucket = bucket || this.defaultBucket;
    return `https://${targetBucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Getter lấy S3Client gốc nếu cần thao tác tùy chỉnh nâng cao
   */
  getClient(): S3Client {
    return this.s3Client;
  }
}
