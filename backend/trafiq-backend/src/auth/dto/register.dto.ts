import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'ali@trafiq.tn', description: 'User email address' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!', minLength: 8, description: 'Password (min 8 chars)' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Ali', description: 'First name' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Ben Salem', description: 'Last name' })
  @IsString()
  @IsNotEmpty()
  lastName: string;
}
