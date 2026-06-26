import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IndustriesService } from './industries.service';

@ApiTags('industries')
@Controller('industries')
/* open-dashboard: auth guard removed */
export class IndustriesController {
  constructor(private industriesService: IndustriesService) {}

  @Get()
  @ApiOperation({ summary: 'List active industries ordered by sort_order' })
  async getIndustries() {
    return this.industriesService.getActiveIndustries();
  }
}
