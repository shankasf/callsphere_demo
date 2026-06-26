import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    skip?: number;
    take?: number;
    organizationId?: number;
    search?: string;
  }) {
    const { skip = 0, take = 50, organizationId, search } = params;

    const where: any = {};
    
    if (organizationId) {
      where.organization_id = organizationId;
    }
    
    if (search) {
      where.OR = [
        { full_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contacts.findMany({
        where,
        skip,
        take,
        include: {
          organizations: {
            select: { organization_id: true, name: true, u_e_code: true },
          },
        },
        orderBy: { full_name: 'asc' },
      }),
      this.prisma.contacts.count({ where }),
    ]);

    return {
      data,
      total,
      page: Math.floor(skip / take) + 1,
      totalPages: Math.ceil(total / take),
    };
  }

  async findOne(id: number) {
    const contact = await this.prisma.contacts.findUnique({
      where: { contact_id: id },
      include: {
        organizations: true,
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact with ID ${id} not found`);
    }

    return contact;
  }

  /**
   * Find contact by phone number - used by voice agent to identify caller
   */
  async findByPhone(phone: string) {
    // Normalize phone number (strip non-digits for matching)
    const normalizedPhone = phone.replace(/\D/g, '');
    
    const contact = await this.prisma.contacts.findFirst({
      where: {
        phone: { contains: normalizedPhone },
      },
      include: {
        organizations: {
          select: {
            organization_id: true,
            name: true,
            u_e_code: true,
          },
        },
      },
    });

    return contact;
  }

  /**
   * Lookup caller by phone + optional U-E code verification
   */
  async lookupCaller(phone: string, ueCode?: string) {
    // First try to find by phone
    const contactByPhone = await this.findByPhone(phone);
    
    if (contactByPhone && ueCode) {
      // Verify U-E code matches (u_e_code is an integer in DB)
      const ueCodeNum = parseInt(ueCode, 10);
      if (contactByPhone.organizations?.u_e_code === ueCodeNum) {
        return {
          found: true,
          verified: true,
          contact: contactByPhone,
          organization: contactByPhone.organizations,
        };
      } else {
        // Phone found but U-E code doesn't match - possible fraud or wrong org
        return {
          found: true,
          verified: false,
          message: 'U-E code does not match phone number organization',
          contact: null,
          organization: null,
        };
      }
    }

    if (contactByPhone) {
      return {
        found: true,
        verified: true,
        contact: contactByPhone,
        organization: contactByPhone.organizations,
      };
    }

    // Try finding by U-E code only (u_e_code is an integer)
    if (ueCode) {
      const ueCodeNum = parseInt(ueCode, 10);
      if (!isNaN(ueCodeNum)) {
        const org = await this.prisma.organizations.findUnique({
          where: { u_e_code: ueCodeNum },
        });

        if (org) {
          return {
            found: false,
            verified: true,
            contact: null,
            organization: org,
            message: 'Organization found but caller not in contacts',
          };
        }
      }
    }

    return {
      found: false,
      verified: false,
      contact: null,
      organization: null,
      message: 'Caller not found in system',
    };
  }

  async create(data: {
    organization_id: number;
    full_name: string;
    email: string;
    phone?: string;
  }) {
    return this.prisma.contacts.create({
      data: {
        organization_id: data.organization_id,
        full_name: data.full_name,
        email: data.email,
        phone: data.phone,
        created_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        organizations: true,
      },
    });
  }

  async update(id: number, data: Partial<{
    full_name: string;
    email: string;
    phone: string;
  }>) {
    await this.findOne(id);

    return this.prisma.contacts.update({
      where: { contact_id: id },
      data: {
        ...data,
        updated_at: new Date(),
      },
      include: {
        organizations: true,
      },
    });
  }
}
