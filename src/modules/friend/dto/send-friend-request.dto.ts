import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class SendFriendRequestDto {
  @ApiProperty({
    description: 'UUID của người dùng nhận lời mời kết bạn',
    example: '78a9c140-5b43-41bb-aef3-018274cbef01',
  })
  @IsUUID('4', { message: 'addresseeId phải là một UUID hợp lệ' })
  @IsNotEmpty({ message: 'addresseeId không được để trống' })
  addresseeId: string;
}
