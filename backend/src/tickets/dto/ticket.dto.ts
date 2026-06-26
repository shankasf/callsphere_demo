import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTicketDto {
  @ApiProperty()
  @IsInt()
  organizationId: number;

  @ApiProperty()
  @IsInt()
  contactId: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  deviceId?: number;

  @ApiProperty()
  @IsString()
  subject: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  priorityId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  callId?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  requiresHumanAgent?: boolean;
}

export class UpdateTicketDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  subject?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  statusId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  priorityId?: number;
}

export class AssignTicketDto {
  @ApiProperty()
  @IsInt()
  agentId: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean = true;
}

export class EscalateTicketDto {
  @ApiProperty()
  @IsInt()
  toAgentId: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}

export class AddMessageDto {
  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: 'Agent ID if sent by agent' })
  @IsInt()
  @IsOptional()
  senderAgentId?: number;

  @ApiPropertyOptional({ description: 'Contact ID if from caller (voice transcript)' })
  @IsInt()
  @IsOptional()
  senderContactId?: number;
}

export class TicketQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  organizationId?: number;
}
