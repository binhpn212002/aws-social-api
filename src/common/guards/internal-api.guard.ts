import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const internalSecret = this.configService.get<string>(
      'INTERNAL_API_SECRET',
      'internal-secret-token',
    );
    const incomingKey = request.headers['x-internal-api-key'];

    if (!incomingKey || incomingKey !== internalSecret) {
      throw new UnauthorizedException(
        'Yêu cầu không hợp lệ: Không có quyền truy cập API nội bộ (Missing or invalid x-internal-api-key)',
      );
    }

    return true;
  }
}
