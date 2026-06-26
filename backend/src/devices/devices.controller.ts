import { Controller, Get, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DevicesService } from './devices.service';
import { DeviceQueryDto } from './dto/device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('devices')
@Controller('devices')
/* open-dashboard: auth guard removed */
@ApiBearerAuth()
export class DevicesController {
  constructor(private devicesService: DevicesService) {}

  @Get()
  @ApiOperation({ summary: 'List devices with pagination and filters' })
  async findAll(@Query() query: DeviceQueryDto) {
    return this.devicesService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get device statistics' })
  async getStats() {
    return this.devicesService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get device details' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.devicesService.findOne(id);
  }
}
