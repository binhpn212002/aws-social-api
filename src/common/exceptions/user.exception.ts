import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

export class UserNotFoundException extends NotFoundException {
  constructor(message = 'Không tìm thấy thông tin người dùng') {
    super(message);
  }
}

export class EmailAlreadyExistsException extends ConflictException {
  constructor(message = 'Email đã được sử dụng') {
    super(message);
  }
}

export class UsernameAlreadyExistsException extends ConflictException {
  constructor(message = 'Username đã được sử dụng') {
    super(message);
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor(message = 'Thông tin đăng nhập không chính xác') {
    super(message);
  }
}

export class UserBannedException extends ForbiddenException {
  constructor(message = 'Tài khoản của bạn đã bị khóa') {
    super(message);
  }
}

export class UserInactiveException extends ForbiddenException {
  constructor(message = 'Tài khoản chưa được kích hoạt') {
    super(message);
  }
}

export class UserInactiveOrNotFoundException extends UnauthorizedException {
  constructor(message = 'User does not exist or is no longer active') {
    super(message);
  }
}
