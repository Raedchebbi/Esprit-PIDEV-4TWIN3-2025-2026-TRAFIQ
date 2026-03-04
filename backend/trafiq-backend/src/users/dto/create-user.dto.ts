import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../enums/role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'agent@trafiq.tn' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Sami' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Karray' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ enum: Role, example: Role.ROAD_USER })
  @IsEnum(Role)
  role: Role;
}
