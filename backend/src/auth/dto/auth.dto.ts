import { IsEmail, IsNotEmpty, IsString, MinLength, IsOptional, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@urackit.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: 'john@urackit.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: 'viewer', enum: ['admin', 'on_call', 'viewer'] })
  @IsString()
  @IsOptional()
  role?: string = 'viewer';
}

export class OtpRequestDto {
  @ApiProperty({ example: 'admin@urackit.com', description: 'Email to send OTP to' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class OtpVerifyDto {
  @ApiProperty({ example: 'admin@urackit.com', description: 'Email that received OTP' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  code: string;
}

export class TokenResponseDto {
  accessToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email to send reset code to' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456', description: '6-digit OTP code' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Code must be exactly 6 digits' })
  code: string;

  @ApiProperty({ example: 'newPassword123', description: 'New password (min 6 chars)' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;
}

