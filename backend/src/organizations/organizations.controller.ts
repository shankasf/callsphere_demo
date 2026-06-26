import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto/organization.dto';

@ApiTags('organizations')
@Controller('organizations')
/* open-dashboard: auth guard removed */
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all organizations with pagination' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('search') search?: string,
  ) {
    return this.organizationsService.findAll({ skip, take, search });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get organization statistics' })
  async getStats() {
    return this.organizationsService.getStats();
  }

  @Get('by-code/:ueCode')
  @ApiOperation({ summary: 'Find organization by U-E code' })
  async findByUECode(@Param('ueCode') ueCode: string) {
    return this.organizationsService.findByUECode(ueCode);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.organizationsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new organization' })
  async create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update organization' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(id, dto);
  }
}
