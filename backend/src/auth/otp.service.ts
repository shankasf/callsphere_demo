import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';
import { randomInt } from 'crypto';

interface OTPRecord {
  email: string;
  code: string;
  expiresAt: Date;
  attempts: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly otpStore: Map<string, OTPRecord> = new Map();
  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly senderEmail: string;
  private readonly devMode: boolean;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const smtpHost = this.configService.get('SMTP_HOST');
    const smtpUser = this.configService.get('SMTP_USERNAME');
    const smtpPass = this.configService.get('SMTP_PASSWORD');

    // Check if SMTP credentials are configured
    this.devMode = !smtpHost || !smtpUser || !smtpPass;

    if (this.devMode) {
      this.logger.warn('⚠️  SMTP credentials not configured - OTP codes will be logged to console (DEV MODE)');
      this.transporter = null;
    } else {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(this.configService.get('SMTP_PORT') || '587', 10),
        secure: false, // Use STARTTLS
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });
      this.logger.log(`📧 SMTP configured: ${smtpHost}`);
    }
    this.senderEmail = this.configService.get('SMTP_SENDER_EMAIL') || 'help@callsphere.tech';
  }

  /**
   * Generate a 6-digit OTP code
   */
  private generateOTP(): string {
    // CSPRNG-backed, uniform over 000000–999999 (Math.random is not crypto-safe).
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /**
   * Check if user exists and get their role
   */
  async validateUserForOTP(email: string): Promise<{ valid: boolean; role?: string; fullName?: string }> {
    const user = await this.prisma.users.findUnique({
      where: { email },
      select: { id: true, role: true, name: true },
    });

    if (!user) {
      return { valid: false };
    }

    return { valid: true, role: user.role as string, fullName: user.name };
  }

  /**
   * Send OTP to user's email
   */
  async sendOTP(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Validate user first
      const userValidation = await this.validateUserForOTP(email);
      if (!userValidation.valid) {
        // Don't reveal if user doesn't exist for security
        return { success: true, message: 'If this email is registered, you will receive an OTP' };
      }

      // Check for existing OTP and rate limiting
      const existingOTP = this.otpStore.get(email);
      if (existingOTP) {
        const timeSinceLastOTP = Date.now() - (existingOTP.expiresAt.getTime() - this.OTP_EXPIRY_MINUTES * 60 * 1000);
        if (timeSinceLastOTP < 60000) { // 1 minute cooldown
          return { success: false, message: 'Please wait before requesting another OTP' };
        }
      }

      const otp = this.generateOTP();
      const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

      // Store OTP
      this.otpStore.set(email, {
        email,
        code: otp,
        expiresAt,
        attempts: 0,
      });

      // Send email via SMTP
      await this.sendOTPEmail(email, otp, userValidation.fullName || 'User');

      this.logger.log(`OTP sent to ${email}`);
      return { success: true, message: 'OTP sent successfully' };
    } catch (error) {
      this.logger.error(`Failed to send OTP to ${email}:`, error);
      return { success: false, message: 'Failed to send OTP. Please try again.' };
    }
  }

  /**
   * Send OTP email via SMTP
   */
  private async sendOTPEmail(email: string, otp: string, name: string): Promise<void> {
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Login Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 480px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 24px; border: 1px solid rgba(59, 130, 246, 0.2); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <tr>
            <td style="padding: 48px 40px; text-align: center;">
              <!-- Logo -->
              <div style="width: 72px; height: 72px; margin: 0 auto 24px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); border-radius: 18px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px; color: white; font-weight: bold;">U</span>
              </div>

              <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 700; background: linear-gradient(90deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                U Rack IT
              </h1>
              <p style="margin: 0 0 32px; color: #94a3b8; font-size: 14px;">
                Voice AI Support Console
              </p>

              <p style="margin: 0 0 16px; color: #e2e8f0; font-size: 16px;">
                Hello ${name},
              </p>
              <p style="margin: 0 0 32px; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                Use the following code to sign in to your account. This code will expire in ${this.OTP_EXPIRY_MINUTES} minutes.
              </p>

              <!-- OTP Code -->
              <div style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 16px; padding: 24px; margin-bottom: 32px;">
                <div style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #3b82f6; font-family: 'Courier New', monospace;">
                  ${otp}
                </div>
              </div>

              <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                If you didn't request this code, please ignore this email or contact support if you have concerns.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background: rgba(0, 0, 0, 0.2); border-radius: 0 0 24px 24px; text-align: center;">
              <p style="margin: 0; color: #475569; font-size: 11px;">
                © 2025 U Rack IT. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const textBody = `
Hello ${name},

Your U Rack IT login code is: ${otp}

This code will expire in ${this.OTP_EXPIRY_MINUTES} minutes.

If you didn't request this code, please ignore this email.

© 2025 U Rack IT
    `;

    // DEV MODE: Log OTP to console instead of sending email
    if (this.devMode) {
      this.logger.warn(`\n${'='.repeat(60)}`);
      this.logger.warn(`🔐 DEV MODE - OTP CODE FOR ${email}`);
      this.logger.warn(`📧 Code: ${otp}`);
      this.logger.warn(`⏰ Expires in ${this.OTP_EXPIRY_MINUTES} minutes`);
      this.logger.warn(`${'='.repeat(60)}\n`);
      return;
    }

    await this.transporter!.sendMail({
      from: `"U Rack IT" <${this.senderEmail}>`,
      to: email,
      subject: `${otp} is your U Rack IT login code`,
      text: textBody,
      html: htmlBody,
    });
  }

  /**
   * Verify OTP code
   */
  async verifyOTP(email: string, code: string): Promise<{ valid: boolean; message: string }> {
    const otpRecord = this.otpStore.get(email);

    if (!otpRecord) {
      return { valid: false, message: 'No OTP found. Please request a new one.' };
    }

    // Check expiry
    if (new Date() > otpRecord.expiresAt) {
      this.otpStore.delete(email);
      return { valid: false, message: 'OTP has expired. Please request a new one.' };
    }

    // Check attempts
    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      this.otpStore.delete(email);
      return { valid: false, message: 'Too many attempts. Please request a new OTP.' };
    }

    // Verify code
    if (otpRecord.code !== code) {
      otpRecord.attempts++;
      return { valid: false, message: `Invalid OTP. ${this.MAX_ATTEMPTS - otpRecord.attempts} attempts remaining.` };
    }

    // Success - clear OTP
    this.otpStore.delete(email);
    return { valid: true, message: 'OTP verified successfully' };
  }

  /**
   * Clean up expired OTPs (run periodically)
   */
  cleanupExpiredOTPs(): void {
    const now = new Date();
    for (const [email, record] of this.otpStore.entries()) {
      if (now > record.expiresAt) {
        this.otpStore.delete(email);
      }
    }
  }

  /**
   * Send password reset confirmation email
   */
  async sendPasswordResetConfirmation(email: string, name: string): Promise<void> {
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Successful</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="min-height: 100vh;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 480px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 24px; border: 1px solid rgba(16, 185, 129, 0.2); box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">
          <tr>
            <td style="padding: 48px 40px; text-align: center;">
              <!-- Logo -->
              <div style="width: 72px; height: 72px; margin: 0 auto 24px; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); border-radius: 18px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px; color: white; font-weight: bold;">U</span>
              </div>

              <h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 700; background: linear-gradient(90deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                U Rack IT
              </h1>
              <p style="margin: 0 0 32px; color: #94a3b8; font-size: 14px;">
                Voice AI Support Console
              </p>

              <!-- Success Icon -->
              <div style="width: 80px; height: 80px; margin: 0 auto 24px; background: rgba(16, 185, 129, 0.1); border: 2px solid rgba(16, 185, 129, 0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 40px; color: #10b981;">✓</span>
              </div>

              <h2 style="margin: 0 0 16px; color: #10b981; font-size: 24px; font-weight: 600;">
                Password Reset Successful
              </h2>

              <p style="margin: 0 0 16px; color: #e2e8f0; font-size: 16px;">
                Hello ${name},
              </p>
              <p style="margin: 0 0 32px; color: #94a3b8; font-size: 14px; line-height: 1.6;">
                Your password has been successfully reset. You can now log in to your account using your new password.
              </p>

              <!-- Login Button -->
              <a href="https://urackit.callsphere.tech/login" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px; margin-bottom: 32px;">
                Go to Login
              </a>

              <p style="margin: 32px 0 0; color: #64748b; font-size: 12px; line-height: 1.6;">
                If you didn't make this change, please contact support immediately or reset your password again.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px; background: rgba(0, 0, 0, 0.2); border-radius: 0 0 24px 24px; text-align: center;">
              <p style="margin: 0; color: #475569; font-size: 11px;">
                © 2025 U Rack IT. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const textBody = `
Hello ${name},

Your password has been successfully reset.

You can now log in to your account using your new password at:
https://urackit.callsphere.tech/login

If you didn't make this change, please contact support immediately or reset your password again.

© 2025 U Rack IT
    `;

    // DEV MODE: Log to console instead of sending email
    if (this.devMode) {
      this.logger.warn(`\n${'='.repeat(60)}`);
      this.logger.warn(`✅ DEV MODE - PASSWORD RESET CONFIRMATION FOR ${email}`);
      this.logger.warn(`${'='.repeat(60)}\n`);
      return;
    }

    try {
      await this.transporter!.sendMail({
        from: `"U Rack IT" <${this.senderEmail}>`,
        to: email,
        subject: 'Your U Rack IT password has been reset',
        text: textBody,
        html: htmlBody,
      });
      this.logger.log(`Password reset confirmation sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset confirmation to ${email}:`, error);
      // Don't throw - this is a non-critical email
    }
  }
}
