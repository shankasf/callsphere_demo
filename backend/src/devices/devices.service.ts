import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DeviceQueryDto } from './dto/device.dto';

@Injectable()
export class DevicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: DeviceQueryDto) {
    const { page = 1, limit = 50, organizationId, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (organizationId) where.organization_id = organizationId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { asset_name: { contains: search, mode: 'insensitive' } },
        { host_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [devices, total] = await Promise.all([
      this.prisma.devices.findMany({
        where,
        skip,
        take: limit,
        orderBy: { asset_name: 'asc' },
        include: {
          organizations: { select: { name: true, u_e_code: true } },
          locations: { select: { name: true, location_type: true } },
          operating_systems: { select: { name: true } },
          device_types: { select: { name: true } },
          device_manufacturers: { select: { name: true } },
          device_models: { select: { name: true } },
        },
      }),
      this.prisma.devices.count({ where }),
    ]);

    return {
      data: devices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const device = await this.prisma.devices.findUnique({
      where: { device_id: id },
      include: {
        organizations: true,
        locations: true,
        operating_systems: true,
        device_types: true,
        device_manufacturers: true,
        device_models: true,
        processor_models: true,
        processor_architectures: true,
        domains: true,
        update_statuses: true,
        contact_devices: {
          include: { contacts: true },
          where: { unassigned_at: null },
        },
        support_tickets: {
          take: 5,
          orderBy: { created_at: 'desc' },
          include: { ticket_statuses: true },
        },
      },
    });

    if (!device) throw new NotFoundException(`Device #${id} not found`);
    return device;
  }

  async findByOrganization(orgId: number) {
    return this.prisma.devices.findMany({
      where: { organization_id: orgId },
      include: {
        locations: { select: { name: true } },
        operating_systems: { select: { name: true } },
      },
      orderBy: { asset_name: 'asc' },
    });
  }

  async getStats() {
    const [total, online, offline] = await Promise.all([
      this.prisma.devices.count(),
      this.prisma.devices.count({ where: { status: 'ONLINE' } }),
      this.prisma.devices.count({ where: { status: 'OFFLINE' } }),
    ]);

    // By organization
    const byOrg = await this.prisma.devices.groupBy({
      by: ['organization_id'],
      _count: { device_id: true },
      orderBy: { _count: { device_id: 'desc' } },
      take: 10,
    });

    // By OS
    const byOS = await this.prisma.devices.groupBy({
      by: ['os_id'],
      _count: { device_id: true },
    });

    return { total, online, offline, byOrganization: byOrg, byOS };
  }
}
