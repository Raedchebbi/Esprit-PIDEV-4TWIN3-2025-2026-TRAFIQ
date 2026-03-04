import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from './users.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './enums/role.enum';

export type SafeUser = Omit<User, 'password' | 'verificationToken' | 'resetPasswordToken' | 'resetPasswordExpires'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  private sanitize(user: UserDocument): SafeUser {
    const obj = user.toObject({ virtuals: true });
    const { password, verificationToken, resetPasswordToken, resetPasswordExpires, __v, _id, ...safe } = obj;
    return { ...safe, id: _id?.toString() ?? safe.id };
  }

  async create(createUserDto: CreateUserDto): Promise<SafeUser> {
    const existing = await this.userModel.findOne({ email: createUserDto.email });
    if (existing) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = await this.userModel.create({
      ...createUserDto,
      password: hashedPassword,
      isVerified: true, // Admin-created users are pre-verified
    });
    return this.sanitize(user);
  }

  async registerUser(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    verificationToken: string;
  }): Promise<UserDocument> {
    return this.userModel.create({
      ...data,
      role: Role.ROAD_USER,
      isVerified: false,
    });
  }

  async findAll(): Promise<SafeUser[]> {
    const users = await this.userModel.find();
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: string): Promise<SafeUser> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return this.sanitize(user);
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email });
  }

  async findByVerificationToken(token: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ verificationToken: token });
  }

  async findByResetToken(token: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ resetPasswordToken: token });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.userModel.findByIdAndUpdate(id, { $set: updateUserDto }, { new: true });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return this.sanitize(user);
  }

  async updateRole(id: string, updateRoleDto: UpdateRoleDto): Promise<SafeUser> {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: { role: updateRoleDto.role } },
      { new: true },
    );
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return this.sanitize(user);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.userModel.findByIdAndUpdate(id, {
      $set: { password: hashed },
      $unset: { resetPasswordToken: '', resetPasswordExpires: '' },
    });
  }

  async saveVerificationToken(id: string, token: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, { $set: { verificationToken: token } });
  }

  async verifyAccount(id: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, {
      $set: { isVerified: true },
      $unset: { verificationToken: '' },
    });
  }

  async saveResetToken(id: string, token: string, expires: Date): Promise<void> {
    await this.userModel.findByIdAndUpdate(id, {
      $set: { resetPasswordToken: token, resetPasswordExpires: expires },
    });
  }

  async deactivate(id: string): Promise<{ message: string }> {
    const user = await this.userModel.findByIdAndUpdate(id, { $set: { isActive: false } });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return { message: `User #${id} deactivated` };
  }
}
