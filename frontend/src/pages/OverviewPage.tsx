import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
    PhoneIncoming,
    PhoneOutgoing,
    Phone,
    Flame,
    Sun,
    Snowflake,
    ArrowUpRight,
    Radio,
} from 'lucide-react';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner, EmptyState } from '../components/common';
import { HourlyCallsChart } from '../components/dashboard/Charts';
import { dashboardApi, businessApi } from '../services/api';
import { useRealtimeUpdates } from '../services/useRealtime';
import { useIndustry } from '../context';
import { getIndustryMetric } from '../config/industryMetrics';

function formatDuration(seconds?: number): string {
    const s = Math.round(Number(seconds ?? 0));
    if (!s) return '0s';
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

function formatCurrency(value?: number): string {
    const n = Number(value ?? 0);
    if (Math.abs(n) >= 1000) {
        return `$${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
    }
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function timeAgo(iso?: string): string {
    if (!iso) return '—';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '—';
    const diff = Math.max(0, Date.now() - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

// Overview — the product-true home for the AI voice + chat agent demo.
// Every value is read live from real endpoints; nothing is hardcoded and the
// demo DB starts at zero, so each block degrades to a calm empty state.
export function OverviewPage() {
    useRealtimeUpdates();
    const { slug } = useIndustry();
    const industryFilter = slug ?? 'all';

    // Call operations metrics (totals, resolution, AHT, hourly volume, agents).
    const {
        data: callsData,
        isLoading: loadingCalls,
        refetch: refetchCalls,
        isFetching: fetchingCalls,
    } = useQuery({
        queryKey: ['overview-calls', industryFilter],
        queryFn: () => dashboardApi.getCalls('7d', industryFilter),
    });

    // Lead / pipeline intelligence (leads, score, profit, hot/warm/cold, by-industry).
    const {
        data: business,
        isLoading: loadingBusiness,
        refetch: refetchBusiness,
    } = useQuery({
        queryKey: ['overview-business', industryFilter],
        queryFn: () => businessApi.getMetrics('7d', industryFilter),
    });

    // Live calls snapshot (refreshes on its own cadence).
    const { data: live } = useQuery({
        queryKey: ['overview-live'],
        queryFn: () => dashboardApi.getLiveCalls(),
        refetchInterval: 5000,
    });

    const isLoading = loadingCalls || loadingBusiness;

    const callMetrics = callsData?.metrics;
    const recentCalls = callsData?.calls ?? [];
    const hourly = callMetrics?.hourly_calls ?? callMetrics?.calls_by_hour ?? [];
    const liveCalls = live?.calls ?? [];

    const breakdown = business?.lead_status_breakdown ?? { hot: 0, warm: 0, cold: 0 };
    const byIndustry = useMemo(
        () =>
            (business?.by_industry ?? [])
                .slice()
                .sort((a, b) => (b.calls ?? 0) - (a.calls ?? 0)),
        [business?.by_industry]
    );
    const maxIndustryCalls = Math.max(1, ...byIndustry.map((r) => r.calls ?? 0));
    const totalLeadStatus = breakdown.hot + breakdown.warm + breakdown.cold;

    // Domain-aware primary outcome: sum the intent_breakdown counts whose intent
    // contains (case-insensitive) any of the selected industry's match strings.
    // Slug 'all'/unknown falls back to a generic "Conversions" definition.
    const domainMetric = getIndustryMetric(slug);
    const domainOutcomeCount = useMemo(() => {
        const rows = business?.intent_breakdown ?? [];
        const needles = domainMetric.matchIntents.map((m) => m.toLowerCase());
        return rows.reduce((sum, row) => {
            const intent = (row.intent ?? '').toLowerCase();
            return needles.some((n) => intent.includes(n)) ? sum + (row.count ?? 0) : sum;
        }, 0);
    }, [business?.intent_breakdown, domainMetric.matchIntents]);

    const refetchAll = () => {
        refetchCalls();
        refetchBusiness();
    };

    if (isLoading) {
        return (
            <DashboardLayout
                title="Overview"
                subtitle="Live performance of your AI voice & chat agent"
            >
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    const leadStatus = [
        { label: 'Hot', value: breakdown.hot, icon: Flame, color: 'text-red-300', bar: 'bg-red-400' },
        { label: 'Warm', value: breakdown.warm, icon: Sun, color: 'text-amber-300', bar: 'bg-amber-400' },
        { label: 'Cold', value: breakdown.cold, icon: Snowflake, color: 'text-blue-300', bar: 'bg-blue-400' },
    ];

    return (
        <DashboardLayout
            title="Overview"
            subtitle="Live performance of your AI voice & chat agent"
            onRefresh={refetchAll}
            isRefreshing={fetchingCalls}
        >
            <div className="fade-in space-y-6">
                {/* ---- KPI row: the headline numbers that define the product ---- */}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
                    <MetricCard
                        label="Total Calls"
                        value={(callMetrics?.total_calls ?? 0).toLocaleString()}
                        icon="phone"
                        color="primary"
                        hint={`${callMetrics?.completed ?? callMetrics?.completed_calls ?? 0} completed`}
                    />
                    {/* Domain-aware outcome: label + matching intents vary by selected industry */}
                    <MetricCard
                        label={domainMetric.primaryLabel}
                        value={domainOutcomeCount.toLocaleString()}
                        icon="check-circle"
                        color="green"
                        hint="from agent conversations"
                    />
                    <MetricCard
                        label="AI Resolution"
                        value={`${Math.round(callMetrics?.ai_resolution_rate ?? 0)}%`}
                        icon="zap"
                        color="green"
                        hint="resolved without a human"
                    />
                    <MetricCard
                        label="Avg Handle Time"
                        value={formatDuration(callMetrics?.avg_duration_seconds)}
                        icon="clock"
                        color="blue"
                        hint="per completed call"
                    />
                    <MetricCard
                        label="Leads"
                        value={(business?.leads_total ?? 0).toLocaleString()}
                        icon="user-plus"
                        color="purple"
                        hint={`${breakdown.hot} hot`}
                    />
                    <MetricCard
                        label="Avg Lead Score"
                        value={`${Math.round(business?.avg_lead_score ?? 0)}`}
                        icon="target"
                        color="orange"
                        hint="out of 100"
                    />
                    <MetricCard
                        label="Projected Profit"
                        value={formatCurrency(business?.projected_close_profit)}
                        icon="dollar-sign"
                        color="green"
                        hint={`${formatCurrency(business?.pipeline_value)} pipeline`}
                    />
                </div>

                {/* ---- Primary chart + live snapshot ---- */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <HourlyCallsChart title="Call Volume by Hour" data={hourly} height={300} />
                    </div>

                    {/* Live calls snapshot */}
                    <Card
                        title="Live Now"
                        headerContent={
                            <span className="flex items-center gap-2 text-xs text-dark-400">
                                <span className="relative flex h-2 w-2">
                                    {liveCalls.length > 0 && (
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    )}
                                    <span
                                        className={`relative inline-flex rounded-full h-2 w-2 ${
                                            liveCalls.length > 0 ? 'bg-emerald-400' : 'bg-dark-500'
                                        }`}
                                    />
                                </span>
                                {liveCalls.length} active
                            </span>
                        }
                    >
                        {liveCalls.length === 0 ? (
                            <EmptyState
                                message="No active calls. Start one with the voice or chat widget to see it stream here in real time."
                                icon={<Radio className="w-9 h-9" />}
                            />
                        ) : (
                            <div className="space-y-2">
                                {liveCalls.slice(0, 6).map((call: any) => {
                                    const id = call.callSid || call.sessionId;
                                    const dir = call.direction || 'inbound';
                                    return (
                                        <div
                                            key={id}
                                            className="panel rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                {dir === 'outbound' ? (
                                                    <PhoneOutgoing className="w-4 h-4 text-emerald-300 flex-shrink-0" />
                                                ) : (
                                                    <PhoneIncoming className="w-4 h-4 text-primary-300 flex-shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <p className="text-sm text-dark-100 truncate font-mono">
                                                        {call.callerName || call.caller_name || call.from || 'Browser'}
                                                    </p>
                                                    <p className="text-xs text-dark-500 capitalize truncate">
                                                        {(call.currentAgent || call.agentType || 'triage').replace('_agent', '')}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="metric-value text-xs text-dark-300 flex-shrink-0">
                                                {formatDuration(call.duration || 0)}
                                            </span>
                                        </div>
                                    );
                                })}
                                <Link
                                    to="/live"
                                    className="flex items-center justify-center gap-1 text-xs font-medium text-primary-300 hover:text-primary-200 pt-1 transition-colors"
                                >
                                    Open live console <ArrowUpRight className="w-3.5 h-3.5" />
                                </Link>
                            </div>
                        )}
                    </Card>
                </div>

                {/* ---- Lead status + by-industry breakdown ---- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Hot / Warm / Cold split */}
                    <Card
                        title="Lead Quality"
                        subtitle="Split of captured leads by intent"
                        headerContent={
                            <Link
                                to="/business"
                                className="text-xs font-medium text-dark-400 hover:text-dark-200 flex items-center gap-1 transition-colors"
                            >
                                Details <ArrowUpRight className="w-3.5 h-3.5" />
                            </Link>
                        }
                    >
                        {totalLeadStatus === 0 ? (
                            <EmptyState
                                message="No leads captured yet. Qualified leads from calls and chats will be scored and split here."
                                icon={<Flame className="w-9 h-9" />}
                            />
                        ) : (
                            <div className="space-y-4 pt-1">
                                {leadStatus.map((s) => {
                                    const Icon = s.icon;
                                    const pct = totalLeadStatus > 0 ? (s.value / totalLeadStatus) * 100 : 0;
                                    return (
                                        <div key={s.label}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className={`flex items-center gap-2 text-sm ${s.color}`}>
                                                    <Icon className="w-4 h-4" />
                                                    {s.label}
                                                </span>
                                                <span className="metric-value text-sm text-dark-100 font-medium">
                                                    {s.value.toLocaleString()}
                                                    <span className="text-dark-500 font-normal ml-1.5 text-xs">
                                                        {Math.round(pct)}%
                                                    </span>
                                                </span>
                                            </div>
                                            <div className="w-full bg-dark-700/60 rounded-full h-1.5">
                                                <div
                                                    className={`h-1.5 rounded-full transition-all duration-500 ${s.bar}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>

                    {/* By-industry call distribution */}
                    <Card
                        title="Calls by Industry"
                        subtitle="Where conversations are happening"
                    >
                        {byIndustry.length === 0 ? (
                            <EmptyState
                                message="No per-industry activity yet."
                                icon={<Phone className="w-9 h-9" />}
                            />
                        ) : (
                            <div className="space-y-3 pt-1">
                                {byIndustry.slice(0, 6).map((row) => {
                                    const pct = ((row.calls ?? 0) / maxIndustryCalls) * 100;
                                    return (
                                        <div key={row.slug}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-sm text-dark-200 truncate pr-3">
                                                    {row.name}
                                                </span>
                                                <span className="metric-value text-sm text-dark-100 font-medium flex-shrink-0">
                                                    {(row.calls ?? 0).toLocaleString()}
                                                </span>
                                            </div>
                                            <div className="w-full bg-dark-700/60 rounded-full h-1.5">
                                                <div
                                                    className="h-1.5 rounded-full bg-primary-500 transition-all duration-500"
                                                    style={{ width: `${Math.max(pct, 2)}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Card>
                </div>

                {/* ---- Recent calls ---- */}
                <Card
                    title="Recent Calls"
                    subtitle="Latest conversations handled by the agent"
                    headerContent={
                        <Link
                            to="/calls"
                            className="text-xs font-medium text-dark-400 hover:text-dark-200 flex items-center gap-1 transition-colors"
                        >
                            View all <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                    }
                >
                    {recentCalls.length === 0 ? (
                        <EmptyState
                            message="No calls recorded yet. Completed conversations will appear here with status, duration, and outcome."
                            icon={<Phone className="w-9 h-9" />}
                        />
                    ) : (
                        <div className="overflow-x-auto -mx-1">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left border-b border-dark-800">
                                        <th className="metric-label pb-2.5 pl-1 font-medium">Caller</th>
                                        <th className="metric-label pb-2.5 font-medium">Agent</th>
                                        <th className="metric-label pb-2.5 font-medium">Status</th>
                                        <th className="metric-label pb-2.5 font-medium text-right">Duration</th>
                                        <th className="metric-label pb-2.5 pr-1 font-medium text-right">When</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentCalls.slice(0, 8).map((call) => {
                                        const status = (call.status || '').toLowerCase();
                                        const statusClass =
                                            status === 'completed'
                                                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20'
                                                : status === 'failed' || status === 'error'
                                                ? 'bg-red-500/10 text-red-300 ring-red-500/20'
                                                : status === 'in_progress'
                                                ? 'bg-amber-500/10 text-amber-300 ring-amber-500/20'
                                                : 'bg-dark-700/40 text-dark-300 ring-dark-600/40';
                                        return (
                                            <tr
                                                key={call.id}
                                                className="border-b border-dark-800/60 last:border-0 hover:bg-dark-800/40 transition-colors"
                                            >
                                                <td className="py-2.5 pl-1 pr-4 text-sm text-dark-100 font-mono truncate max-w-[160px]">
                                                    {call.caller_name || call.caller_phone || 'Browser'}
                                                </td>
                                                <td className="py-2.5 pr-4">
                                                    <span className="text-sm text-dark-300 capitalize">
                                                        {(call.last_agent || call.agent_type || 'triage').replace('_agent', '')}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 pr-4">
                                                    <span
                                                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ring-1 ring-inset ${statusClass}`}
                                                    >
                                                        {call.status || 'unknown'}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 pr-4 text-right metric-value text-sm text-dark-200">
                                                    {formatDuration(call.duration_seconds)}
                                                </td>
                                                <td className="py-2.5 pr-1 text-right text-xs text-dark-400">
                                                    {timeAgo(call.created_at || call.started_at)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </DashboardLayout>
    );
}
