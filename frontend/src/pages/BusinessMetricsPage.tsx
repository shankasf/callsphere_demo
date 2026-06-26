import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
} from 'recharts';
import { DashboardLayout } from '../components/layout';
import {
    MetricCard,
    Card,
    GaugeCard,
    LoadingSpinner,
    EmptyState,
} from '../components/common';
import { businessApi, industriesApi } from '../services/api';
import { useIndustry } from '../context/IndustryContext';
import {
    TrendingUp,
    Flame,
    Sun,
    Snowflake,
    AlertCircle,
    Filter,
} from 'lucide-react';
import type { Industry } from '../types';

type RangeValue = 'today' | '7d' | '30d' | '90d';

const RANGE_OPTIONS: { value: RangeValue; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 90 Days' },
];

function formatCurrency(value?: number): string {
    const n = Number(value ?? 0);
    if (Math.abs(n) >= 1000) {
        return `$${(n / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k`;
    }
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDuration(seconds?: number): string {
    const s = Math.round(Number(seconds ?? 0));
    if (!s) return '0s';
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs}s`;
}

// Lead Intelligence / Business Metrics page.
// Everything renders from GET /api/dashboard/business — no hardcoded numbers.
export function BusinessMetricsPage() {
    const { slug: activeSlug } = useIndustry();
    const [range, setRange] = useState<RangeValue>('7d');
    // Default the industry filter to the active demo industry (or "all").
    const [industryFilter, setIndustryFilter] = useState<string>(activeSlug ?? 'all');

    const { data: industries } = useQuery({
        queryKey: ['industries'],
        queryFn: () => industriesApi.getAll(),
    });

    const {
        data,
        isLoading,
        isError,
        refetch,
        isFetching,
    } = useQuery({
        queryKey: ['business-metrics', range, industryFilter],
        queryFn: () => businessApi.getMetrics(range, industryFilter),
    });

    const sortedIndustries: Industry[] = useMemo(
        () =>
            (industries ?? [])
                .slice()
                .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        [industries]
    );

    const breakdown = data?.lead_status_breakdown ?? { hot: 0, warm: 0, cold: 0 };
    const funnel = data?.funnel ?? { calls: 0, engaged: 0, leads: 0, hot: 0 };
    const byIndustry = data?.by_industry ?? [];

    // Funnel stages with relative widths against the top of the funnel.
    const funnelStages = useMemo(() => {
        const top = Math.max(funnel.calls, 1);
        return [
            { label: 'Calls', value: funnel.calls, color: '#06b6d4' },
            { label: 'Engaged', value: funnel.engaged, color: '#3b82f6' },
            { label: 'Leads', value: funnel.leads, color: '#8b5cf6' },
            { label: 'Hot Leads', value: funnel.hot, color: '#ef4444' },
        ].map((s) => ({ ...s, pct: Math.min((s.value / top) * 100, 100) }));
    }, [funnel]);

    const pipelineChartData = useMemo(
        () =>
            byIndustry.map((r) => ({
                name: r.name,
                pipelineValue: Number(r.pipelineValue ?? 0),
            })),
        [byIndustry]
    );

    const PIPELINE_COLORS = ['#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#10b981', '#06b6d4'];

    const headerControls = (
        <div className="flex items-center gap-2">
            {/* Range selector */}
            <select
                value={range}
                onChange={(e) => setRange(e.target.value as RangeValue)}
                aria-label="Date range"
                className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-sm text-dark-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
                {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>

            {/* Industry filter */}
            <div className="relative">
                <Filter className="w-4 h-4 text-dark-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                    value={industryFilter}
                    onChange={(e) => setIndustryFilter(e.target.value)}
                    aria-label="Industry filter"
                    className="bg-dark-800 border border-dark-700 rounded-lg pl-9 pr-3 py-2 text-sm text-dark-200 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                    <option value="all">All Industries</option>
                    {sortedIndustries.map((ind) => (
                        <option key={ind.slug} value={ind.slug}>
                            {ind.name}
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );

    if (isLoading) {
        return (
            <DashboardLayout
                title="Lead Intelligence"
                subtitle="Lead scoring, pipeline value, and conversion funnel"
                headerContent={headerControls}
            >
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Lead Intelligence"
            subtitle="Lead scoring, pipeline value, and conversion funnel"
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
            headerContent={headerControls}
        >
            <div className="fade-in space-y-6">
                {isError && (
                    <div className="glass rounded-xl p-4 flex items-center gap-3 text-sm text-red-300 border border-red-900/40">
                        <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
                        <span>
                            Couldn’t load business metrics. The demo backend may still be
                            starting up — showing empty values.
                        </span>
                    </div>
                )}

                {/* Headline KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                        label="Total Calls"
                        value={data?.calls_total ?? 0}
                        icon="phone"
                        color="primary"
                    />
                    <MetricCard
                        label="Total Leads"
                        value={data?.leads_total ?? 0}
                        icon="user-plus"
                        color="blue"
                    />
                    <MetricCard
                        label="Pipeline Value"
                        value={formatCurrency(data?.pipeline_value)}
                        icon="dollar-sign"
                        color="green"
                    />
                    <MetricCard
                        label="Avg Lead Score"
                        value={`${Math.round(data?.avg_lead_score ?? 0)}/100`}
                        icon="target"
                        color="purple"
                    />
                </div>

                {/* Lead score gauge + hot/warm/cold breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card title="Average Lead Score" className="flex flex-col justify-center">
                        <div className="text-center py-2">
                            <p className="text-5xl font-bold text-primary-400">
                                {Math.round(data?.avg_lead_score ?? 0)}
                                <span className="text-2xl text-dark-400 font-medium">/100</span>
                            </p>
                            <p className="text-sm text-dark-400 mt-1">across captured leads</p>
                        </div>
                        <div className="mt-4">
                            <GaugeCard
                                title="Lead quality"
                                value={Math.round(data?.avg_lead_score ?? 0)}
                                max={100}
                                unit="/100"
                                color="primary"
                            />
                        </div>
                    </Card>

                    {/* Hot / Warm / Cold */}
                    <Card title="Lead Status Breakdown" className="lg:col-span-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="rounded-xl border border-red-900/40 bg-red-600/10 p-4">
                                <div className="flex items-center gap-2 text-red-400">
                                    <Flame className="w-5 h-5" />
                                    <span className="text-sm font-medium">Hot</span>
                                </div>
                                <p className="text-3xl font-bold text-white mt-2">
                                    {breakdown.hot}
                                </p>
                            </div>
                            <div className="rounded-xl border border-yellow-900/40 bg-yellow-600/10 p-4">
                                <div className="flex items-center gap-2 text-yellow-400">
                                    <Sun className="w-5 h-5" />
                                    <span className="text-sm font-medium">Warm</span>
                                </div>
                                <p className="text-3xl font-bold text-white mt-2">
                                    {breakdown.warm}
                                </p>
                            </div>
                            <div className="rounded-xl border border-blue-900/40 bg-blue-600/10 p-4">
                                <div className="flex items-center gap-2 text-blue-400">
                                    <Snowflake className="w-5 h-5" />
                                    <span className="text-sm font-medium">Cold</span>
                                </div>
                                <p className="text-3xl font-bold text-white mt-2">
                                    {breakdown.cold}
                                </p>
                            </div>
                        </div>

                        {/* Profit projections */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 text-dark-400 text-sm">
                                    <TrendingUp className="w-4 h-4 text-primary-400" />
                                    Weighted Interest Profit
                                </div>
                                <p className="text-2xl font-bold text-primary-400 mt-1">
                                    {formatCurrency(data?.interest_profit)}
                                </p>
                            </div>
                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 text-dark-400 text-sm">
                                    <TrendingUp className="w-4 h-4 text-green-400" />
                                    Projected Close Profit
                                </div>
                                <p className="text-2xl font-bold text-green-400 mt-1">
                                    {formatCurrency(data?.projected_close_profit)}
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Conversion funnel */}
                <Card title="Conversion Funnel">
                    {funnel.calls === 0 ? (
                        <EmptyState message="No funnel data for this range yet." />
                    ) : (
                        <div className="space-y-3">
                            {funnelStages.map((stage) => (
                                <div key={stage.label}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="text-dark-300">{stage.label}</span>
                                        <span className="text-dark-200 font-medium">
                                            {stage.value.toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="w-full bg-dark-700 rounded-full h-3 overflow-hidden">
                                        <div
                                            className="h-3 rounded-full transition-all duration-500"
                                            style={{
                                                width: `${stage.pct}%`,
                                                backgroundColor: stage.color,
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* By-industry pipeline chart */}
                <Card title="Pipeline Value by Industry">
                    {pipelineChartData.length === 0 ? (
                        <EmptyState message="No per-industry data available." />
                    ) : (
                        <div style={{ height: 320 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={pipelineChartData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis
                                        type="number"
                                        stroke="#94a3b8"
                                        fontSize={12}
                                        tickFormatter={(v) => formatCurrency(Number(v))}
                                    />
                                    <YAxis
                                        dataKey="name"
                                        type="category"
                                        stroke="#94a3b8"
                                        fontSize={11}
                                        width={110}
                                        tickFormatter={(value: string) =>
                                            value.length > 14 ? `${value.substring(0, 14)}…` : value
                                        }
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1e293b',
                                            border: '1px solid #334155',
                                            borderRadius: '8px',
                                        }}
                                        formatter={(value) => [
                                            formatCurrency(Number(value ?? 0)),
                                            'Pipeline',
                                        ]}
                                    />
                                    <Bar dataKey="pipelineValue" radius={[0, 4, 4, 0]}>
                                        {pipelineChartData.map((_, index) => (
                                            <Cell
                                                key={`cell-${index}`}
                                                fill={PIPELINE_COLORS[index % PIPELINE_COLORS.length]}
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </Card>

                {/* By-industry table */}
                <Card title="Industry Breakdown">
                    {byIndustry.length === 0 ? (
                        <EmptyState message="No per-industry data available." />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-dark-400 text-sm border-b border-dark-800">
                                        <th className="pb-3 pr-4">Industry</th>
                                        <th className="pb-3 pr-4 text-right">Calls</th>
                                        <th className="pb-3 pr-4 text-right">Leads</th>
                                        <th className="pb-3 pr-4 text-right">Avg Score</th>
                                        <th className="pb-3 pr-4 text-right">Pipeline</th>
                                        <th className="pb-3 pr-4 text-right">Interest Profit</th>
                                        <th className="pb-3 text-right">Close Profit</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {byIndustry.map((row) => (
                                        <tr
                                            key={row.slug}
                                            className="border-b border-dark-800 hover:bg-dark-800/50"
                                        >
                                            <td className="py-3 pr-4 text-dark-100 font-medium">
                                                {row.name}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-dark-300">
                                                {row.calls.toLocaleString()}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-dark-300">
                                                {row.leads.toLocaleString()}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-dark-300">
                                                {Math.round(row.avgLeadScore ?? 0)}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-green-400">
                                                {formatCurrency(row.pipelineValue)}
                                            </td>
                                            <td className="py-3 pr-4 text-right text-primary-400">
                                                {formatCurrency(row.interestProfit)}
                                            </td>
                                            <td className="py-3 text-right text-dark-200">
                                                {formatCurrency(row.closeProfit)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Operational KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <MetricCard
                        label="AI Resolution"
                        value={`${Math.round(data?.ai_resolution_rate ?? 0)}%`}
                        icon="zap"
                        color="purple"
                    />
                    <MetricCard
                        label="Escalation Rate"
                        value={`${Math.round(data?.escalation_rate ?? 0)}%`}
                        icon="alert-triangle"
                        color="orange"
                    />
                    <MetricCard
                        label="Avg Duration"
                        value={formatDuration(data?.avg_duration_seconds)}
                        icon="clock"
                        color="blue"
                    />
                    <MetricCard
                        label="Completed"
                        value={data?.completed ?? 0}
                        icon="check"
                        color="green"
                    />
                    <MetricCard
                        label="Failed"
                        value={data?.failed ?? 0}
                        icon="x"
                        color="red"
                    />
                    <MetricCard
                        label="In Progress"
                        value={data?.in_progress ?? 0}
                        icon="activity"
                        color="yellow"
                    />
                </div>
            </div>
        </DashboardLayout>
    );
}

export default BusinessMetricsPage;
