import { createParamDecorator, ExecutionContext } from '@nestjs/common';

interface RequestWithUser {
  user?: Record<string, unknown>;
}

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext): unknown => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    if (!user) {
      return null;
    }
    if ((data === 'userId' || data === 'id') && !user[data] && user['sub']) {
      return user['sub'];
    }
    return data ? user[data] : user;
  },
);
