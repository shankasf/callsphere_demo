import { IsString, IsOptional, IsNumber, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateContactDto {
  @ApiProperty({ description: 'Organization ID' })
  @IsNumber()
  organization_id: number;

  @ApiProperty({ description: 'Full name of contact' })
  @IsString()
  full_name: string;

  @ApiProperty({ description: 'Email address' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class UpdateContactDto extends PartialType(CreateContactDto) {}
