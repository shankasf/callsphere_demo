import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface IndustryDto {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  greeting: string | null;
  accentColor: string | null;
  icon: string | null;
  sortOrder: number;
}

@Injectable()
export class IndustriesService {
  constructor(private prisma: PrismaService) {}

  async getActiveIndustries(): Promise<IndustryDto[]> {
    const rows = await this.prisma.industries.findMany({
      where: { is_active: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      greeting: r.greeting,
      accentColor: r.accent_color,
      icon: r.icon,
      sortOrder: r.sort_order ?? 0,
    }));
  }
}
