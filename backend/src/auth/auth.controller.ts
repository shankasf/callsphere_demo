import { Controller, Post, Body, Get, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiQuery } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, OtpRequestDto, OtpVerifyDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password (for requesters)' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('requester-login')
  @ApiOperation({ summary: 'Login with email and password (for requesters only)' })
  async requesterLogin(@Body() dto: LoginDto) {
    return this.authService.requesterLogin(dto);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new dashboard user (admin only in prod)' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('otp/request')
  @ApiOperation({ summary: 'Request OTP code for email login (admin/agent only)' })
  @ApiBody({ type: OtpRequestDto })
  async requestOTP(@Body() dto: OtpRequestDto) {
    return this.authService.requestOTP(dto.email);
  }

  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify OTP and login (admin/agent only)' })
  @ApiBody({ type: OtpVerifyDto })
  async verifyOTP(@Body() dto: OtpVerifyDto) {
    return this.authService.verifyOTPLogin(dto.email, dto.code);
  }

  @Get('check-role')
  @ApiOperation({ summary: 'Check user role and auth method by email' })
  @ApiQuery({ name: 'email', required: true })
  async checkRole(@Query('email') email: string) {
    return this.authService.getUserRole(email);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req: any) {
    return req.user;
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset code via email' })
  @ApiBody({ type: ForgotPasswordDto })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with OTP code' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}

