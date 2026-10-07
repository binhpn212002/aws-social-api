import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalApiGuard } from './internal-api.guard';

describe('InternalApiGuard', () => {
  let guard: InternalApiGuard;
  let configService: jest.Mocked<Partial<ConfigService>>;

  beforeEach(() => {
    configService = {
      get: jest.fn().mockReturnValue('super-secret-key'),
    };
    guard = new InternalApiGuard(configService as ConfigService);
  });

  const mockExecutionContext = (headers: Record<string, string>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as unknown as ExecutionContext;
  };

  it('nên cho phép qua nếu header x-internal-api-key khớp với secret', () => {
    const context = mockExecutionContext({
      'x-internal-api-key': 'super-secret-key',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('nên ném UnauthorizedException nếu thiếu header x-internal-api-key', () => {
    const context = mockExecutionContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('nên ném UnauthorizedException nếu header x-internal-api-key không khớp', () => {
    const context = mockExecutionContext({
      'x-internal-api-key': 'wrong-key',
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
