import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    Phone,
    Radio,
    Gauge,
    BarChart3,
    ShieldCheck,
    Ticket,
    Monitor,
    Building2,
    Users,
    Activity,
    DollarSign,
    TrendingUp,
    Settings,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    AudioLines,
    MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { useIndustry } from '../../context';
import { IndustryIcon } from '../common';

interface NavItem {
    path: string;
    label: string;
    icon: LucideIcon;
}

// Nav is grouped so the voice-agent / lead workflow reads as primary, and the
// inherited CRM/device pages are clearly secondary. Routes are unchanged — this
// is purely curation of how they're presented.
const navGroups: { heading: string; items: NavItem[] }[] = [
    {
        heading: 'Operations',
        items: [
            { path: '/overview', label: 'Overview', icon: LayoutDashboard },
            { path: '/live', label: 'Live Calls', icon: Radio },
            { path: '/calls', label: 'Calls', icon: Phone },
            { path: '/business', label: 'Lead Intelligence', icon: TrendingUp },
            { path: '/chatbot', label: 'Chatbot Metrics', icon: MessageSquare },
        ],
    },
    {
        heading: 'Intelligence',
        items: [
            { path: '/quality', label: 'Quality & AI', icon: Gauge },
            { path: '/analytics', label: 'Analytics', icon: BarChart3 },
            { path: '/costs', label: 'Costs & ROI', icon: DollarSign },
            { path: '/compliance', label: 'Compliance', icon: ShieldCheck },
        ],
    },
    {
        heading: 'Records',
        items: [
            { path: '/organizations', label: 'Organizations', icon: Building2 },
            { path: '/contacts', label: 'Contacts', icon: Users },
            { path: '/tickets', label: 'Tickets', icon: Ticket },
            { path: '/devices', label: 'Devices', icon: Monitor },
            { path: '/system', label: 'System Health', icon: Activity },
        ],
    },
];

export function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { industry, clearIndustry } = useIndustry();

    const accent = industry?.accentColor || '#2dd4bf';

    const switchIndustry = () => {
        clearIndustry();
        navigate('/start');
    };

    const isItemActive = (path: string) =>
        location.pathname === path || (path === '/overview' && location.pathname === '/');

    const renderItem = (item: NavItem) => {
        const Icon = item.icon;
        const active = isItemActive(item.path);
        return (
            <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-0',
                    active
                        ? 'bg-primary-500/10 text-primary-200'
                        : 'text-dark-300 hover:bg-dark-800/70 hover:text-dark-50'
                )}
            >
                {/* Active accent rail */}
                <span
                    className={clsx(
                        'absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary-400 transition-opacity',
                        active ? 'opacity-100' : 'opacity-0'
                    )}
                />
                <Icon
                    className={clsx(
                        'w-[18px] h-[18px] flex-shrink-0',
                        active ? 'text-primary-300' : 'text-dark-400 group-hover:text-dark-200'
                    )}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
        );
    };

    return (
        <aside
            className={clsx(
                'fixed left-0 top-0 h-full bg-dark-925 border-r border-dark-800 z-50 flex flex-col transition-all duration-300',
                collapsed ? 'w-[68px]' : 'w-64'
            )}
        >
            {/* Logo lockup */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-dark-800 flex-shrink-0">
                <Link to="/overview" className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary-500/15 ring-1 ring-inset ring-primary-500/25 flex items-center justify-center flex-shrink-0">
                        <AudioLines className="w-[18px] h-[18px] text-primary-300" />
                    </div>
                    {!collapsed && (
                        <div className="min-w-0 leading-tight">
                            <p className="text-sm font-semibold text-dark-50 tracking-tight truncate">
                                CallSphere
                            </p>
                            <p className="text-[10px] uppercase tracking-[0.14em] text-dark-500">
                                Demo Console
                            </p>
                        </div>
                    )}
                </Link>
                <button
                    onClick={() => setCollapsed(!collapsed)}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    className={clsx(
                        'p-1.5 rounded-md text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-colors',
                        collapsed && 'absolute right-2'
                    )}
                >
                    {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
            </div>

            {/* Active-industry indicator + switcher */}
            <div className="flex-shrink-0 p-3 border-b border-dark-800">
                <div className="panel rounded-lg p-2.5">
                    <div className="flex items-center gap-2.5">
                        <div
                            className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${accent}1f`, color: accent }}
                        >
                            <IndustryIcon icon={industry?.icon} slug={industry?.slug} className="w-[18px] h-[18px]" />
                        </div>
                        {!collapsed && (
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] uppercase tracking-[0.1em] text-dark-500">
                                    Active demo
                                </p>
                                <p className="text-sm font-medium text-dark-50 truncate">
                                    {industry?.name || 'No industry'}
                                </p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={switchIndustry}
                        title="Switch industry"
                        aria-label="Switch industry"
                        className={clsx(
                            'mt-2.5 flex items-center gap-2 rounded-md bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-dark-50 transition-colors text-xs font-medium',
                            collapsed ? 'w-full justify-center py-2' : 'w-full px-3 py-2'
                        )}
                    >
                        <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
                        {!collapsed && <span>Switch industry</span>}
                    </button>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-4 space-y-5">
                {navGroups.map((group) => (
                    <div key={group.heading} className="space-y-1">
                        {!collapsed && (
                            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-dark-500">
                                {group.heading}
                            </p>
                        )}
                        {group.items.map(renderItem)}
                    </div>
                ))}

                <div className="pt-2 border-t border-dark-800 space-y-1">
                    <Link
                        to="/settings"
                        title={collapsed ? 'Settings' : undefined}
                        className={clsx(
                            'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-dark-300 hover:bg-dark-800/70 hover:text-dark-50 transition-colors',
                            collapsed && 'justify-center px-0'
                        )}
                    >
                        <Settings className="w-[18px] h-[18px] text-dark-400 group-hover:text-dark-200 flex-shrink-0" />
                        {!collapsed && <span>Settings</span>}
                    </Link>
                </div>
            </nav>
        </aside>
    );
}
