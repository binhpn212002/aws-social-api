import { Request } from 'express';

export class ClientInfoUtil {
  /**
   * Trích xuất địa chỉ IP thực của client từ các headers của AWS CloudFront / ALB / Nginx
   */
  static extractClientIp(req: Request): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const cloudfrontIp = req.headers['cloudfront-viewer-address'];
    if (cloudfrontIp) {
      const address = Array.isArray(cloudfrontIp)
        ? cloudfrontIp[0]
        : cloudfrontIp;
      return address.split(':')[0].trim();
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0].trim() : realIp.trim();
    }

    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  /**
   * Chuẩn hóa User-Agent thành định dạng ngắn gọn: [Trình duyệt] / [Hệ điều hành]
   */
  static parseDeviceInfo(userAgent?: string | null): string {
    if (!userAgent || userAgent.trim() === '') {
      return 'Unknown Device';
    }

    const ua = userAgent.toLowerCase();

    // Xác định Hệ điều hành
    let os = 'Unknown OS';
    if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios')) {
      os = 'iOS';
    } else if (ua.includes('android')) {
      os = 'Android';
    } else if (ua.includes('macintosh') || ua.includes('mac os x')) {
      os = 'macOS';
    } else if (ua.includes('windows')) {
      os = 'Windows';
    } else if (ua.includes('linux')) {
      os = 'Linux';
    }

    // Xác định Trình duyệt / Client
    let browser = 'Unknown Client';
    if (ua.includes('postmanruntime')) {
      browser = 'Postman';
    } else if (ua.includes('edg/')) {
      browser = 'Edge';
    } else if (ua.includes('chrome/') && !ua.includes('edg/')) {
      browser = 'Chrome';
    } else if (ua.includes('safari/') && !ua.includes('chrome/')) {
      browser = 'Safari';
    } else if (ua.includes('firefox/')) {
      browser = 'Firefox';
    } else if (ua.includes('okhttp') || ua.includes('cfnetwork')) {
      browser = 'Mobile App';
    }

    return `${browser} / ${os}`;
  }
}
