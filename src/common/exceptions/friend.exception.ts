import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class FriendshipNotFoundException extends NotFoundException {
  constructor(message = 'Không tìm thấy thông tin quan hệ bạn bè') {
    super(message);
  }
}

export class FriendRequestNotFoundException extends NotFoundException {
  constructor(message = 'Không tìm thấy lời mời kết bạn') {
    super(message);
  }
}

export class SelfFriendRequestException extends BadRequestException {
  constructor(message = 'Bạn không thể gửi lời mời kết bạn cho chính mình') {
    super(message);
  }
}

export class AlreadyFriendsException extends ConflictException {
  constructor(message = 'Hai người đã là bạn bè của nhau') {
    super(message);
  }
}

export class FriendRequestAlreadySentException extends BadRequestException {
  constructor(
    message = 'Bạn đã gửi lời mời kết bạn trước đó, vui lòng chờ phản hồi',
  ) {
    super(message);
  }
}

export class FriendBlockedException extends ForbiddenException {
  constructor(message = 'Không thể thực hiện thao tác do bị chặn tương tác') {
    super(message);
  }
}
