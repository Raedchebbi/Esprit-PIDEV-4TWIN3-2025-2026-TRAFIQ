import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Reset token received by email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewP@ss1!', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
