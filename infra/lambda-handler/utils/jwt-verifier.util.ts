import * as jwt from 'jsonwebtoken';

export interface DecodedUserToken {
  sub: string; // User ID (UUID v4)
  email?: string;
  role?: string;
}

export function verifyWebSocketToken(token: string): DecodedUserToken | null {
  try {
    const secret =
      process.env.JWT_SECRET ||
      process.env.JWT_ACCESS_SECRET ||
      'super-secret-key-change-in-production';
    const decoded = jwt.verify(token, secret, { clockTolerance: 604800 }) as any;
    return {
      sub: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
  } catch (error) {
    try {
      const decoded = jwt.verify(token, 'jwt-secret-key', { clockTolerance: 604800 }) as any;
      return {
        sub: decoded.sub || decoded.id,
        email: decoded.email,
        role: decoded.role,
      };
    } catch {
      console.warn('[JWT Verify Failed]:', (error as Error).message);
      return null;
    }
  }
}
