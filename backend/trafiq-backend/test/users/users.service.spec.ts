import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from '../../src/users/users.service';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../../src/users/users.entity';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Role } from '../../src/users/enums/role.enum';

const rawUser = {
  _id: 'user-id-1',
  email: 'test@trafiq.tn',
  password: 'hashed_password',
  firstName: 'Khalil',
  lastName: 'Aljani',
  role: Role.OPERATOR,
  isVerified: true,
  isActive: true,
  verificationToken: null,
  resetPasswordToken: null,
  resetPasswordExpires: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUserDoc = {
  ...rawUser,
  toObject: jest.fn().mockReturnValue(rawUser),
};

const mockUserModel = {
  findOne: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  create: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
    mockUserDoc.toObject.mockReturnValue(rawUser);
  });

  describe('create()', () => {
    it('should create a user successfully', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockResolvedValue(mockUserDoc);

      const result = await service.create({
        email: 'test@trafiq.tn',
        password: 'Password123!',
        firstName: 'Khalil',
        lastName: 'Aljani',
        role: Role.OPERATOR,
      });

      expect(result).not.toHaveProperty('password');
      expect(result.email).toBe('test@trafiq.tn');
    });

    it('should throw ConflictException if email exists', async () => {
      mockUserModel.findOne.mockResolvedValue(mockUserDoc);

      await expect(
        service.create({
          email: 'test@trafiq.tn',
          password: 'Password123!',
          firstName: 'Khalil',
          lastName: 'Aljani',
          role: Role.OPERATOR,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll()', () => {
    it('should return all users without passwords', async () => {
      mockUserModel.find.mockResolvedValue([mockUserDoc]);
      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('password');
    });
  });

  describe('findOne()', () => {
    it('should return a user by id', async () => {
      mockUserModel.findById.mockResolvedValue(mockUserDoc);
      const result = await service.findOne('user-id-1');
      expect(result.email).toBe('test@trafiq.tn');
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findById.mockResolvedValue(null);
      await expect(service.findOne('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateRole()', () => {
    it('should update user role and return updated document', async () => {
      const updatedDoc = { ...mockUserDoc, role: Role.ADMIN, toObject: jest.fn().mockReturnValue({ ...rawUser, role: Role.ADMIN }) };
      mockUserModel.findByIdAndUpdate.mockResolvedValue(updatedDoc);

      const result = await service.updateRole('user-id-1', { role: Role.ADMIN });
      expect(result.role).toBe(Role.ADMIN);
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-id-1',
        { $set: { role: Role.ADMIN } },
        { new: true },
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.updateRole('bad-id', { role: Role.ADMIN })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivate()', () => {
    it('should deactivate a user', async () => {
      mockUserModel.findByIdAndUpdate.mockResolvedValue(mockUserDoc);

      const result = await service.deactivate('user-id-1');
      expect(result.message).toContain('deactivated');
      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'user-id-1',
        { $set: { isActive: false } },
      );
    });

    it('should throw NotFoundException if user not found', async () => {
      mockUserModel.findByIdAndUpdate.mockResolvedValue(null);
      await expect(service.deactivate('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
