import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email hoặc username của người dùng',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email hoặc username không được để trống' })
  identifier: string;

  @ApiProperty({ example: 'P@ssword123', description: 'Mật khẩu' })
  @IsString()
  @IsNotEmpty({ message: 'Mật khẩu không được để trống' })
  password: string;
}
