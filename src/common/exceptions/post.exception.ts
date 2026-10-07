import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class PostNotFoundException extends NotFoundException {
  constructor(message = 'Không tìm thấy bài viết hoặc bài viết đã bị xóa') {
    super(message);
  }
}

export class PostForbiddenException extends ForbiddenException {
  constructor(
    message = 'Bạn không có quyền thực hiện thao tác trên bài viết này',
  ) {
    super(message);
  }
}

export class InvalidMediaException extends BadRequestException {
  constructor(message = 'Tệp đa phương tiện không hợp lệ') {
    super(message);
  }
}
