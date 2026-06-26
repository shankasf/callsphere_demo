import {
    Stethoscope,
    Home,
    Hotel,
    Landmark,
    Wrench,
    Car,
    Scale,
    Cpu,
    Building2,
    Briefcase,
    Smile,
    ShieldCheck,
    Truck,
    Brain,
    Sparkles,
    type LucideIcon,
} from 'lucide-react';

// Maps the backend `icon` string (and a few slug fallbacks) onto a concrete
// lucide-react icon. Unknown values degrade gracefully to a neutral default.
const ICON_MAP: Record<string, LucideIcon> = {
    // explicit icon names from the backend
    stethoscope: Stethoscope,
    home: Home,
    hotel: Hotel,
    landmark: Landmark,
    wrench: Wrench,
    car: Car,
    scale: Scale,
    cpu: Cpu,
    building: Building2,
    building2: Building2,
    briefcase: Briefcase,
    smile: Smile,
    shield: ShieldCheck,
    truck: Truck,
    brain: Brain,
    sparkles: Sparkles,
    // industry-slug fallbacks (in case `icon` is missing)
    healthcare: Stethoscope,
    real_estate: Home,
    hospitality: Hotel,
    finance: Landmark,
    home_services: Wrench,
    automotive: Car,
    legal: Scale,
    saas: Cpu,
    dental: Smile,
    insurance: ShieldCheck,
    logistics: Truck,
    behavioral_health: Brain,
    salon_spa: Sparkles,
};

const DEFAULT_ICON: LucideIcon = Building2;

export function resolveIndustryIcon(icon?: string, slug?: string): LucideIcon {
    const key = (icon || '').trim().toLowerCase();
    if (key && ICON_MAP[key]) return ICON_MAP[key];
    const slugKey = (slug || '').trim().toLowerCase();
    if (slugKey && ICON_MAP[slugKey]) return ICON_MAP[slugKey];
    return DEFAULT_ICON;
}

interface IndustryIconProps {
    icon?: string;
    slug?: string;
    className?: string;
}

export function IndustryIcon({ icon, slug, className }: IndustryIconProps) {
    const Icon = resolveIndustryIcon(icon, slug);
    return <Icon className={className} />;
}
