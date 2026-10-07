import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email của người dùng',
  })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @IsNotEmpty({ message: 'Email không được để trống' })
  email: string;

  @ApiProperty({
    example: 'nguyenvana',
    description: 'Username duy nhất, chỉ chứa ký tự thường, số và gạch dưới',
  })
  @IsString()
  @Length(3, 30, { message: 'Username phải từ 3 đến 30 ký tự' })
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Username chỉ được chứa chữ thường (a-z), chữ số (0-9) và dấu gạch dưới (_)',
  })
  username: string;

  @ApiProperty({
    example: 'P@ssword123',
    description:
      'Mật khẩu tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  @IsString()
  @Length(8, 64, { message: 'Mật khẩu phải từ 8 đến 64 ký tự' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message:
        'Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt (@$!%*?&)',
    },
  )
  password: string;

  @ApiProperty({ example: 'Nguyễn Văn A', description: 'Họ và tên đầy đủ' })
  @IsString()
  @IsNotEmpty({ message: 'Họ và tên không được để trống' })
  @Length(2, 100, { message: 'Họ và tên phải từ 2 đến 100 ký tự' })
  fullName: string;
}
