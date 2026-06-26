import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
    Phone,
    Clock,
    Activity,
    Ticket,
    Server,
    Users,
    CheckCircle,
    ArrowUp,
    TrendingUp,
    FolderOpen,
    Plus,
    Shield,
    DollarSign,
    Zap,
    Target,
    RefreshCw,
    UserPlus,
    Star,
    X,
    XCircle,
    TrendingDown,
    AlertTriangle,
    AlertCircle,
    Monitor,
    Cpu,
    Mail,
    Database,
    Eye,
    Lock,
} from 'lucide-react';

type IconName =
    | 'phone'
    | 'clock'
    | 'activity'
    | 'ticket'
    | 'server'
    | 'users'
    | 'check'
    | 'check-circle'
    | 'arrow-up'
    | 'trending'
    | 'folder-open'
    | 'plus'
    | 'shield'
    | 'dollar-sign'
    | 'zap'
    | 'target'
    | 'refresh'
    | 'repeat'
    | 'user-plus'
    | 'star'
    | 'x'
    | 'x-circle'
    | 'trending-down'
    | 'alert-triangle'
    | 'alert-circle'
    | 'monitor'
    | 'cpu'
    | 'mail'
    | 'database'
    | 'eye'
    | 'lock';

export type { IconName };

type ColorName = 'primary' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'gray';

const iconMap: Record<IconName, typeof Phone> = {
    phone: Phone,
    clock: Clock,
    activity: Activity,
    ticket: Ticket,
    server: Server,
    users: Users,
    check: CheckCircle,
    'check-circle': CheckCircle,
    'arrow-up': ArrowUp,
    trending: TrendingUp,
    'folder-open': FolderOpen,
    plus: Plus,
    shield: Shield,
    'dollar-sign': DollarSign,
    zap: Zap,
    target: Target,
    refresh: RefreshCw,
    repeat: RefreshCw,
    'user-plus': UserPlus,
    star: Star,
    x: X,
    'x-circle': XCircle,
    'trending-down': TrendingDown,
    'alert-triangle': AlertTriangle,
    'alert-circle': AlertCircle,
    monitor: Monitor,
    cpu: Cpu,
    mail: Mail,
    database: Database,
    eye: Eye,
    lock: Lock,
};

const colorClasses: Record<ColorName, { bg: string; text: string }> = {
    primary: { bg: 'bg-primary-500/10 ring-1 ring-inset ring-primary-500/20', text: 'text-primary-300' },
    blue: { bg: 'bg-blue-500/10 ring-1 ring-inset ring-blue-500/20', text: 'text-blue-300' },
    green: { bg: 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/20', text: 'text-emerald-300' },
    yellow: { bg: 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/20', text: 'text-amber-300' },
    orange: { bg: 'bg-orange-500/10 ring-1 ring-inset ring-orange-500/20', text: 'text-orange-300' },
    red: { bg: 'bg-red-500/10 ring-1 ring-inset ring-red-500/20', text: 'text-red-300' },
    purple: { bg: 'bg-violet-500/10 ring-1 ring-inset ring-violet-500/20', text: 'text-violet-300' },
    gray: { bg: 'bg-dark-700/40 ring-1 ring-inset ring-dark-600/40', text: 'text-dark-300' },
};

interface MetricCardProps {
    label: string;
    value: string | number;
    icon: IconName;
    color?: ColorName;
    /** Optional supporting line under the value (e.g. trend, context). */
    hint?: string;
}

export function MetricCard({ label, value, icon, color = 'primary', hint }: MetricCardProps) {
    const Icon = iconMap[icon] || Activity;
    const colors = colorClasses[color];

    return (
        <div className="surface metric-card rounded-xl p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
                <p className="metric-label truncate pt-0.5">{label}</p>
                <div
                    className={clsx(
                        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                        colors.bg,
                        colors.text
                    )}
                >
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <p className="metric-value text-2xl md:text-[1.75rem] font-semibold text-white mt-2.5 truncate leading-none">
                {value}
            </p>
            {hint && <p className="text-xs text-dark-400 mt-2 truncate">{hint}</p>}
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: string | number;
    subtitle: string;
    color?: 'primary' | 'green' | 'yellow' | 'red';
}

export function StatCard({ label, value, subtitle, color = 'primary' }: StatCardProps) {
    const textColors = {
        primary: 'text-primary-300',
        green: 'text-emerald-300',
        yellow: 'text-amber-300',
        red: 'text-red-300',
    };
    const dotColors = {
        primary: 'bg-primary-400',
        green: 'bg-emerald-400',
        yellow: 'bg-amber-400',
        red: 'bg-red-400',
    };

    return (
        <div className="panel rounded-xl p-4 flex items-center justify-between gap-3 overflow-hidden">
            <div className="min-w-0">
                <p className="text-sm font-medium text-dark-100 truncate flex items-center gap-2">
                    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColors[color])} />
                    {label}
                </p>
                <p className="text-xs text-dark-400 truncate mt-0.5 pl-3.5">{subtitle}</p>
            </div>
            <p className={clsx('metric-value text-2xl font-semibold truncate flex-shrink-0', textColors[color])}>
                {value}
            </p>
        </div>
    );
}

interface GaugeCardProps {
    title: string;
    value: number;
    max?: number;
    unit: string;
    color?: 'primary' | 'purple' | 'blue' | 'green' | 'yellow' | 'red';
    subtitle?: string;
}

export function GaugeCard({ title, value, max = 100, unit, color = 'primary', subtitle }: GaugeCardProps) {
    const bgColors = {
        primary: 'bg-primary-500',
        purple: 'bg-violet-500',
        blue: 'bg-blue-500',
        green: 'bg-emerald-500',
        yellow: 'bg-amber-500',
        red: 'bg-red-500',
    };

    const percent = Math.min((value / max) * 100, 100);

    return (
        <div className="panel rounded-xl p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-3 gap-2">
                <span className="text-sm text-dark-200 truncate">{title}</span>
                <span className="metric-value text-sm text-dark-100 font-medium flex-shrink-0">
                    {value}
                    {unit}
                </span>
            </div>
            <div className="w-full bg-dark-700/60 rounded-full h-1.5">
                <div
                    className={clsx('h-1.5 rounded-full transition-all duration-500', bgColors[color])}
                    style={{ width: `${percent}%` }}
                />
            </div>
            {subtitle && <p className="text-xs text-dark-400 mt-2 truncate">{subtitle}</p>}
        </div>
    );
}

export interface LatencyCardProps {
    label: string;
    value: number;
    unit?: string;
}

export function LatencyCard({ label, value, unit = 'ms' }: LatencyCardProps) {
    const getColor = (v: number) => {
        if (v < 100) return 'text-emerald-300';
        if (v < 300) return 'text-amber-300';
        return 'text-red-300';
    };

    return (
        <div className="panel rounded-xl p-4 overflow-hidden">
            <p className="metric-label truncate">{label}</p>
            <p className={clsx('metric-value text-xl md:text-2xl font-semibold mt-1.5', getColor(value))}>
                {value}{unit}
            </p>
        </div>
    );
}

interface CardProps {
    title?: string;
    subtitle?: string;
    children: ReactNode;
    className?: string;
    headerContent?: ReactNode;
    /** Tighter padding for dense cards. */
    compact?: boolean;
}

export function Card({ title, subtitle, children, className, headerContent, compact }: CardProps) {
    return (
        <div className={clsx('surface rounded-xl', compact ? 'p-4' : 'p-5', className)}>
            {(title || headerContent) && (
                <div className="flex items-start justify-between gap-3 mb-4">
                    {title && (
                        <div className="min-w-0">
                            <h3 className="text-[0.9375rem] font-semibold text-dark-50 tracking-tight truncate">
                                {title}
                            </h3>
                            {subtitle && (
                                <p className="text-xs text-dark-400 mt-0.5 truncate">{subtitle}</p>
                            )}
                        </div>
                    )}
                    {headerContent && <div className="flex-shrink-0">{headerContent}</div>}
                </div>
            )}
            {children}
        </div>
    );
}

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
    const sizes = {
        sm: 'w-6 h-6',
        md: 'w-12 h-12',
        lg: 'w-16 h-16',
    };

    return (
        <div className="flex items-center justify-center p-8">
            <div
                className={clsx(
                    sizes[size],
                    'border-2 border-dark-600 border-t-primary-400 rounded-full animate-spin'
                )}
            />
        </div>
    );
}

export function EmptyState({ message, icon }: { message: string; icon?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center min-h-48 py-10 text-center gap-3">
            {icon && <div className="text-dark-500">{icon}</div>}
            <p className="text-sm text-dark-400 max-w-xs">{message}</p>
        </div>
    );
}

// Re-export persisted input components
export { PersistedInput, PersistedTextarea } from './PersistedInput';

// Industry icon helpers
export { IndustryIcon, resolveIndustryIcon } from './industryIcon';
