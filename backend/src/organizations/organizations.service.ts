import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    search?: string;
  }) {
    const { skip = 0, take = 50, search } = params;

    // u_e_code is an integer, name is a string
    const where: any = {};
    if (search) {
      // Try to parse as number for u_e_code search
      const searchNum = parseInt(search, 10);
      if (!isNaN(searchNum)) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { u_e_code: searchNum },
        ];
      } else {
        where.name = { contains: search, mode: 'insensitive' };
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.organizations.findMany({
        where,
        skip,
        take,
        include: {
          _count: {
            select: {
              devices: true,
              contacts: true,
              support_tickets: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.organizations.count({ where }),
    ]);

    return {
      data,
      total,
      page: Math.floor(skip / take) + 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: number) {
    const org = await this.prisma.organizations.findUnique({
      where: { organization_id: id },
      include: {
        devices: true,
        contacts: true,
        support_tickets: {
          take: 10,
          orderBy: { created_at: 'desc' },
        },
        _count: {
          select: {
            devices: true,
            contacts: true,
            support_tickets: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }

    return org;
  }

  async findByUECode(ueCode: string) {
    const ueCodeNum = parseInt(ueCode, 10);
    if (isNaN(ueCodeNum)) {
      throw new NotFoundException(`Invalid U-E code: ${ueCode}`);
    }

    const org = await this.prisma.organizations.findUnique({
      where: { u_e_code: ueCodeNum },
      include: {
        devices: true,
        contacts: true,
        _count: {
          select: {
            devices: true,
            contacts: true,
            support_tickets: true,
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with U-E code ${ueCode} not found`);
    }

    return org;
  }

  async create(data: {
    name: string;
    u_e_code: number;
    manager_id?: number;
  }) {
    return this.prisma.organizations.create({
      data: {
        name: data.name,
        u_e_code: data.u_e_code,
        manager_id: data.manager_id,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  async update(id: number, data: Partial<{
    name: string;
    manager_id: number;
  }>) {
    await this.findOne(id);

    return this.prisma.organizations.update({
      where: { organization_id: id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  }

  async getStats() {
    const [total, withDevices, recentlyActive] = await Promise.all([
      this.prisma.organizations.count(),
      this.prisma.organizations.count({
        where: {
          devices: { some: {} },
        },
      }),
      this.prisma.organizations.count({
        where: {
          support_tickets: {
            some: {
              created_at: {
                gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
              },
            },
          },
        },
      }),
    ]);

    return {
      total,
      withDevices,
      recentlyActive,
    };
  }
}
