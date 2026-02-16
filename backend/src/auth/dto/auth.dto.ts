import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email: string;

  @IsNotEmpty({ message: 'Password wajib diisi.' })
  password: string;
}

export class RefreshDto {
  @IsNotEmpty()
  refresh_token: string;
}

export class CreateUserDto {
  @IsEmail({}, { message: 'Format email tidak valid.' })
  email: string;

  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  password: string;

  @IsNotEmpty({ message: 'Nama lengkap wajib diisi.' })
  full_name: string;

  role?: 'admin' | 'operator';
}
