import { IsOptional, IsString, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class DeviceQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  organizationId?: number;

  @ApiPropertyOptional({ enum: ['ONLINE', 'OFFLINE'] })
  @IsOptional()
  @IsString()
  status?: 'ONLINE' | 'OFFLINE';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
