import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { UsersService } from '../../src/users/users.service';
import { JwtService } from '@nestjs/jwt';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Role } from '../../src/users/enums/role.enum';
import * as bcrypt from 'bcryptjs';

const mockUser = {
  id: 'uuid-1',
  email: 'operator@trafiq.tn',
  password: bcrypt.hashSync('Password123!', 10),
  firstName: 'Khalil',
  lastName: 'Aljani',
  role: Role.OPERATOR,
  isVerified: true,
  isActive: true,
  verificationToken: null,
  resetPasswordToken: 'valid-token',
  resetPasswordExpires: new Date(Date.now() + 3600000),
};

const mockUsersService = {
  findByEmail: jest.fn(),
  findByVerificationToken: jest.fn(),
  findByResetToken: jest.fn(),
  verifyAccount: jest.fn(),
  saveResetToken: jest.fn(),
  updatePassword: jest.fn(),
  registerUser: jest.fn().mockResolvedValue(mockUser),
};

const mockJwtService = { sign: jest.fn().mockReturnValue('mock_jwt_token') };
const mockMailerService = { sendMail: jest.fn().mockResolvedValue(true) };
const mockConfigService = { get: jest.fn().mockReturnValue('http://localhost:3000') };

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailerService, useValue: mockMailerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login()', () => {
    it('should return accessToken on valid credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('mock_jwt_token');
      const result = await service.login({
        email: 'operator@trafiq.tn',
        password: 'Password123!',
      });
      expect(result).toHaveProperty('accessToken');
      expect(result.accessToken).toBe('mock_jwt_token');
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      await expect(
        service.login({ email: 'operator@trafiq.tn', password: 'WrongPass!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@trafiq.tn', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if account not verified', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ ...mockUser, isVerified: false });
      await expect(
        service.login({ email: 'operator@trafiq.tn', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('verifyEmail()', () => {
    it('should verify email with valid token', async () => {
      mockUsersService.findByVerificationToken.mockResolvedValue({
        ...mockUser,
        isVerified: false,
        verificationToken: 'valid-token',
      });
      mockUsersService.verifyAccount.mockResolvedValue(undefined);

      const result = await service.verifyEmail('valid-token');
      expect(result.message).toContain('verified');
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockUsersService.findByVerificationToken.mockResolvedValue(null);
      await expect(service.verifyEmail('bad-token')).rejects.toThrow(BadRequestException);
    });
  });

  describe('forgotPassword()', () => {
    it('should send reset email if user exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.saveResetToken.mockResolvedValue(undefined);
      mockMailerService.sendMail.mockResolvedValue(true);

      const result = await service.forgotPassword({ email: 'operator@trafiq.tn' });
      expect(result.message).toContain('sent');
      expect(mockMailerService.sendMail).toHaveBeenCalled();
    });

    it('should return same message even if user does not exist (security)', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: 'nobody@trafiq.tn' });
      expect(result.message).toContain('sent');
      expect(mockMailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword()', () => {
    it('should reset password with valid token', async () => {
      mockUsersService.findByResetToken.mockResolvedValue(mockUser);
      mockUsersService.updatePassword.mockResolvedValue(undefined);

      const result = await service.resetPassword({
        token: 'valid-token',
        newPassword: 'NewPassword123!',
      });
      expect(result.message).toContain('successfully');
    });

    it('should throw BadRequestException for invalid token', async () => {
      mockUsersService.findByResetToken.mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: 'bad-token', newPassword: 'NewPassword123!' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired token', async () => {
      mockUsersService.findByResetToken.mockResolvedValue({
        ...mockUser,
        resetPasswordExpires: new Date(Date.now() - 1000), // expired
      });
      await expect(
        service.resetPassword({ token: 'expired-token', newPassword: 'NewPassword123!' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
