import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  // ── REGISTER ─────────────────────────────────────────────────────────────
  async register(registerDto: RegisterDto) {
    const existing = await this.usersService.findByEmail(registerDto.email);
    if (existing) throw new BadRequestException('Email already in use');

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await this.usersService.registerUser({
      ...registerDto,
      password: hashedPassword,
      verificationToken,
    });

    const verifyUrl = `${this.configService.get('APP_URL')}/api/auth/verify-email?token=${verificationToken}`;

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: '🚦 TRAFIQ — Verify your email',
        html: `
          <h2>Welcome to TRAFIQ, ${user.firstName}!</h2>
          <p>Please verify your email by clicking the button below:</p>
          <a href="${verifyUrl}" style="
            background:#1d4ed8;color:white;padding:12px 24px;
            border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px
          ">Verify Email</a>
          <p style="margin-top:16px;color:#6b7280">Link expires in 24 hours.</p>
        `,
      });
    } catch (mailErr) {
      console.warn('[TRAFIQ] Could not send verification email:', mailErr.message);
    }

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  // ── VERIFY EMAIL ──────────────────────────────────────────────────────────
  async verifyEmail(token: string) {
    const user = await this.usersService.findByVerificationToken(token);
    if (!user) throw new BadRequestException('Invalid or expired verification token');
    if (user.isVerified) throw new BadRequestException('Account already verified');

    await this.usersService.verifyAccount(user.id);
    return { message: 'Email verified successfully. You can now log in.' };
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isVerified) throw new UnauthorizedException('Please verify your email before logging in');
    if (!user.isActive) throw new UnauthorizedException('Your account has been deactivated');

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isVerified: user.isVerified,
      },
    };
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(forgotPasswordDto.email);
    // Always return success to avoid email enumeration
    if (!user) return { message: 'If this email exists, a reset link has been sent.' };

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.usersService.saveResetToken(user.id, resetToken, expires);

    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: '🔑 TRAFIQ — Reset your password',
        html: `
          <h2>Password Reset Request</h2>
          <p>Hi ${user.firstName}, we received a request to reset your password.</p>
          <p>Use this token in the reset form:</p>
          <code style="background:#f1f5f9;padding:12px;display:block;border-radius:6px;font-size:14px">${resetToken}</code>
          <p style="color:#6b7280;margin-top:16px">This token expires in 1 hour. If you didn't request this, ignore this email.</p>
        `,
      });
    } catch (mailErr) {
      console.warn('[TRAFIQ] Could not send reset email:', mailErr.message);
    }

    return { message: 'If this email exists, a reset link has been sent.' };
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────────────
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const user = await this.usersService.findByResetToken(resetPasswordDto.token);
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    if (user.resetPasswordExpires < new Date()) {
      throw new BadRequestException('Reset token has expired. Please request a new one.');
    }

    await this.usersService.updatePassword(user.id, resetPasswordDto.newPassword);
    return { message: 'Password reset successfully. You can now log in.' };
  }
}
