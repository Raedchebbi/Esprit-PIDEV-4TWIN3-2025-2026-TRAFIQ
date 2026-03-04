import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ali@trafiq.tn', description: 'Registered email address' })
  @IsEmail()
  email: string;
}
