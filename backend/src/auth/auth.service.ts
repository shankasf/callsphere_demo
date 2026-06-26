import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { LoginDto, RegisterDto, TokenResponseDto, ResetPasswordDto } from './dto/auth.dto';
import { OtpService } from './otp.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private otpService: OtpService,
  ) {}

  /**
   * Universal password login - works for all roles
   */
  async login(dto: LoginDto): Promise<TokenResponseDto> {
    const user = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password_hash) {
      throw new UnauthorizedException('Password not set. Please use OTP login.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        role: user.role,
      },
    };
  }

  async register(dto: RegisterDto): Promise<TokenResponseDto> {
    const existingUser = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.users.create({
      data: {
        email: dto.email,
        name: dto.fullName,
        password_hash: passwordHash,
        role: (dto.role as any) || 'viewer',  // Valid roles: admin, on_call, viewer
      },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        role: user.role,
      },
    };
  }

  async validateUser(userId: string) {
    return this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  }

  /**
   * Request OTP for email login (works for all roles)
   */
  async requestOTP(email: string): Promise<{ success: boolean; message: string }> {
    return this.otpService.sendOTP(email);
  }

  /**
   * Verify OTP and complete login (works for all roles)
   */
  async verifyOTPLogin(email: string, code: string): Promise<TokenResponseDto> {
    // Verify OTP first
    const otpResult = await this.otpService.verifyOTP(email, code);
    if (!otpResult.valid) {
      throw new BadRequestException(otpResult.message);
    }

    // Get user data
    const user = await this.prisma.users.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate JWT token
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Requester login with password (kept for backward compatibility)
   */
  async requesterLogin(dto: LoginDto): Promise<TokenResponseDto> {
    return this.login(dto);
  }

  /**
   * Get user role by email (used to determine login method)
   */
  async getUserRole(email: string): Promise<{ role: string | null; authMethod: 'otp' | 'password' | 'both' }> {
    const user = await this.prisma.users.findUnique({
      where: { email },
      select: { role: true },
    });

    if (!user) {
      return { role: null, authMethod: 'both' };
    }

    // All roles can use both OTP and password
    return { role: user.role as string, authMethod: 'both' };
  }

  /**
   * Request password reset - sends OTP to email
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    return this.otpService.sendOTP(email);
  }

  /**
   * Reset password with OTP verification
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ success: boolean; message: string }> {
    // Verify OTP first
    const otpResult = await this.otpService.verifyOTP(dto.email, dto.code);
    if (!otpResult.valid) {
      throw new BadRequestException(otpResult.message);
    }

    // Find user
    const user = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Hash new password and update
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.users.update({
      where: { email: dto.email },
      data: { password_hash: passwordHash },
    });

    // Send confirmation email (non-blocking)
    this.otpService.sendPasswordResetConfirmation(dto.email, user.name || 'User');

    return { success: true, message: 'Password reset successfully' };
  }
}
