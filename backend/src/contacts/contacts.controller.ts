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
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateContactDto, UpdateContactDto } from './dto/contact.dto';

@ApiTags('contacts')
@Controller('contacts')
/* open-dashboard: auth guard removed */
@ApiBearerAuth()
export class ContactsController {
  constructor(private contactsService: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all contacts with pagination' })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiQuery({ name: 'organizationId', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('skip') skip?: number,
    @Query('take') take?: number,
    @Query('organizationId') organizationId?: number,
    @Query('search') search?: string,
  ) {
    return this.contactsService.findAll({ skip, take, organizationId, search });
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Lookup caller by phone and optional U-E code (for voice agent)' })
  @ApiQuery({ name: 'phone', required: true })
  @ApiQuery({ name: 'ueCode', required: false })
  async lookupCaller(
    @Query('phone') phone: string,
    @Query('ueCode') ueCode?: string,
  ) {
    return this.contactsService.lookupCaller(phone, ueCode);
  }

  @Get('by-phone/:phone')
  @ApiOperation({ summary: 'Find contact by phone number' })
  async findByPhone(@Param('phone') phone: string) {
    return this.contactsService.findByPhone(phone);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact by ID' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new contact' })
  async create(@Body() dto: CreateContactDto) {
    return this.contactsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(id, dto);
  }
}
