import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner } from '../components/common';
import { CostTrendChart } from '../components/dashboard/Charts';
import { dashboardApi } from '../services/api';
import { DollarSign, TrendingUp, Coins, Calculator, PiggyBank } from 'lucide-react';

export function CostsPage() {
    const { data: costs, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-costs'],
        queryFn: () => dashboardApi.getCosts(),
    });

    const metrics = costs?.metrics;

    if (isLoading) {
        return (
            <DashboardLayout title="Costs & ROI" subtitle="Track AI usage costs and return on investment">
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
        }).format(value);
    };

    const formatNumber = (value: number) => {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value.toString();
    };

    return (
        <DashboardLayout
            title="Costs & ROI"
            subtitle="Track AI usage costs and return on investment"
            onRefresh={() => refetch()}
        >
            <div className="fade-in space-y-6">
                {/* Top Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <MetricCard
                        label="Today's Cost"
                        value={formatCurrency(metrics?.cost_today || 0)}
                        icon="dollar-sign"
                        color="primary"
                    />
                    <MetricCard
                        label="Week Cost"
                        value={formatCurrency(metrics?.cost_week || 0)}
                        icon="dollar-sign"
                        color="blue"
                    />
                    <MetricCard
                        label="Month Cost"
                        value={formatCurrency(metrics?.cost_month || 0)}
                        icon="dollar-sign"
                        color="purple"
                    />
                    <MetricCard
                        label="Tokens Today"
                        value={formatNumber(metrics?.tokens_today || 0)}
                        icon="cpu"
                        color="orange"
                    />
                    <MetricCard
                        label="Avg Cost/Call"
                        value={formatCurrency(metrics?.avg_cost_per_call || 0)}
                        icon="phone"
                        color="green"
                    />
                    <MetricCard
                        label="ROI"
                        value={`${metrics?.roi_percent || 0}%`}
                        icon="activity"
                        color={
                            (metrics?.roi_percent || 0) >= 100
                                ? 'green'
                                : (metrics?.roi_percent || 0) >= 50
                                    ? 'yellow'
                                    : 'red'
                        }
                    />
                </div>

                {/* Cost Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="flex items-center gap-4">
                        <div className="p-4 rounded-lg bg-blue-600/20">
                            <Coins className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-blue-400">
                                {formatNumber(metrics?.input_tokens || 0)}
                            </div>
                            <div className="text-sm text-dark-400">Input Tokens</div>
                            <div className="text-xs text-blue-400/60 mt-1">
                                {formatCurrency(metrics?.input_cost || 0)}
                            </div>
                        </div>
                    </Card>

                    <Card className="flex items-center gap-4">
                        <div className="p-4 rounded-lg bg-purple-600/20">
                            <Calculator className="w-8 h-8 text-purple-400" />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-purple-400">
                                {formatNumber(metrics?.output_tokens || 0)}
                            </div>
                            <div className="text-sm text-dark-400">Output Tokens</div>
                            <div className="text-xs text-purple-400/60 mt-1">
                                {formatCurrency(metrics?.output_cost || 0)}
                            </div>
                        </div>
                    </Card>

                    <Card className="flex items-center gap-4">
                        <div className="p-4 rounded-lg bg-green-600/20">
                            <PiggyBank className="w-8 h-8 text-green-400" />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-green-400">
                                {formatCurrency(metrics?.savings || 0)}
                            </div>
                            <div className="text-sm text-dark-400">Estimated Savings</div>
                            <div className="text-xs text-green-400/60 mt-1">
                                vs. human agents
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Cost Trend Chart */}
                <CostTrendChart
                    title="Daily Cost Trend"
                    data={metrics?.daily_costs || []}
                />

                {/* Model Costs */}
                <Card title="Cost by Model">
                    <div className="space-y-4">
                        {(metrics?.cost_by_model || []).map((model, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-primary-500" />
                                    <div>
                                        <div className="font-medium">{model.model}</div>
                                        <div className="text-xs text-dark-400">
                                            {formatNumber(model.tokens || 0)} tokens
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-48 h-2 bg-dark-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary-500"
                                            style={{
                                                width: `${Math.min(
                                                    100,
                                                    ((model.cost || 0) / (metrics?.cost_today || 1)) * 100
                                                )}%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-dark-300 w-24 text-right font-mono">
                                        {formatCurrency(model.cost || 0)}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {(!metrics?.cost_by_model || metrics.cost_by_model.length === 0) && (
                            <div className="text-center text-dark-400 py-4">No model cost data available</div>
                        )}
                    </div>
                </Card>

                {/* Cost Summary Table */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card title="Period Comparison">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-dark-400 border-b border-dark-800">
                                    <th className="pb-3">Period</th>
                                    <th className="pb-3 text-right">Cost</th>
                                    <th className="pb-3 text-right">Tokens</th>
                                    <th className="pb-3 text-right">Calls</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-dark-800">
                                    <td className="py-3">Today</td>
                                    <td className="py-3 text-right font-mono">{formatCurrency(metrics?.cost_today || 0)}</td>
                                    <td className="py-3 text-right font-mono">{formatNumber(metrics?.tokens_today || 0)}</td>
                                    <td className="py-3 text-right font-mono">{metrics?.calls_today || 0}</td>
                                </tr>
                                <tr className="border-b border-dark-800">
                                    <td className="py-3">This Week</td>
                                    <td className="py-3 text-right font-mono">{formatCurrency(metrics?.cost_week || 0)}</td>
                                    <td className="py-3 text-right font-mono">{formatNumber(metrics?.tokens_week || 0)}</td>
                                    <td className="py-3 text-right font-mono">{metrics?.calls_week || 0}</td>
                                </tr>
                                <tr className="border-b border-dark-800">
                                    <td className="py-3">This Month</td>
                                    <td className="py-3 text-right font-mono">{formatCurrency(metrics?.cost_month || 0)}</td>
                                    <td className="py-3 text-right font-mono">{formatNumber(metrics?.tokens_month || 0)}</td>
                                    <td className="py-3 text-right font-mono">{metrics?.calls_month || 0}</td>
                                </tr>
                                <tr>
                                    <td className="py-3 font-medium">All Time</td>
                                    <td className="py-3 text-right font-mono font-medium">
                                        {formatCurrency(metrics?.cost_total || 0)}
                                    </td>
                                    <td className="py-3 text-right font-mono font-medium">
                                        {formatNumber(metrics?.tokens_total || 0)}
                                    </td>
                                    <td className="py-3 text-right font-mono font-medium">{metrics?.calls_total || 0}</td>
                                </tr>
                            </tbody>
                        </table>
                    </Card>

                    <Card title="ROI Analysis">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-green-400" />
                                    <span>Cost Reduction</span>
                                </div>
                                <span className="font-mono text-green-400">
                                    {formatCurrency(metrics?.cost_reduction || 0)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="w-5 h-5 text-blue-400" />
                                    <span>Human Agent Cost (Est.)</span>
                                </div>
                                <span className="font-mono text-blue-400">
                                    {formatCurrency(metrics?.human_agent_cost || 0)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-dark-800/50 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Coins className="w-5 h-5 text-purple-400" />
                                    <span>AI Cost</span>
                                </div>
                                <span className="font-mono text-purple-400">
                                    {formatCurrency(metrics?.ai_cost || 0)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-green-600/10 border border-green-500/30 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <PiggyBank className="w-5 h-5 text-green-400" />
                                    <span className="font-medium">Net Savings</span>
                                </div>
                                <span className="font-mono text-lg font-bold text-green-400">
                                    {formatCurrency(metrics?.savings || 0)}
                                </span>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
