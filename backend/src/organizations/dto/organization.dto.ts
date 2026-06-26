import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({ description: 'Organization name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Unique U-E code identifier (integer)' })
  @IsNumber()
  u_e_code: number;

  @ApiPropertyOptional({ description: 'Account manager ID' })
  @IsOptional()
  @IsNumber()
  manager_id?: number;
}

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}
