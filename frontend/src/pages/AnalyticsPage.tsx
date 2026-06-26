import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, EmptyState, LoadingSpinner } from '../components/common';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';
import {
    RefreshCw,
    TrendingUp,
} from 'lucide-react';
import { dashboardApi } from '../services/api';


export function AnalyticsPage() {
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [timeRange, setTimeRange] = useState('7d');

    // Fetch analytics from API
    const fetchData = useCallback(async () => {
        try {
            const response = await dashboardApi.getAnalyticsMetrics(timeRange);
            if (response) {
                setData(response);
                setLastRefresh(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch analytics:', error);
        } finally {
            setIsLoading(false);
        }
    }, [timeRange]);

    // Initial fetch and periodic refresh
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (isLoading) {
        return (
            <DashboardLayout
                title="Analytics"
                subtitle="Customer experience, support effectiveness, and business outcomes"
            >
                <div className="flex items-center justify-center h-96">
                    <LoadingSpinner size="lg" />
                </div>
            </DashboardLayout>
        );
    }

    const customerExperience = data?.customerExperience || {};
    const supportEffectiveness = data?.supportEffectiveness || {};
    const businessOutcomes = data?.businessOutcomes || {};

    const hasData = data && (
        customerExperience.containmentRate !== null ||
        supportEffectiveness.firstCallResolution !== null ||
        businessOutcomes.callVolume?.total > 0
    );

    return (
        <DashboardLayout
            title="Analytics"
            subtitle="Customer experience, support effectiveness, and business outcomes"
            headerContent={
                <div className="flex items-center gap-4">
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm"
                    >
                        <option value="1d">Today</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                    </select>
                    <button
                        onClick={fetchData}
                        className="flex items-center gap-2 text-sm text-dark-400 hover:text-dark-200 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh</span>
                    </button>
                    <span className="text-xs text-dark-500">
                        Last updated: {lastRefresh.toLocaleTimeString()}
                    </span>
                </div>
            }
        >
            <div className="fade-in space-y-6">
                {!hasData ? (
                    <Card title="No Data Available">
                        <EmptyState
                            message="No analytics data available for this time period. Data will appear once calls are processed."
                            icon={<TrendingUp className="w-12 h-12 text-dark-500" />}
                        />
                    </Card>
                ) : (
                    <>
                        {/* Top Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                            <MetricCard
                                label="CSAT"
                                value={customerExperience.csat !== null ? customerExperience.csat.toFixed(2) : '—'}
                                icon="star"
                                color="yellow"
                            />
                            <MetricCard
                                label="NPS"
                                value={customerExperience.nps !== null ? `${customerExperience.nps > 0 ? '+' : ''}${customerExperience.nps}` : '—'}
                                icon="trending"
                                color={customerExperience.nps !== null ? (customerExperience.nps >= 50 ? 'green' : customerExperience.nps >= 0 ? 'yellow' : 'red') : 'gray'}
                            />
                            <MetricCard
                                label="Containment"
                                value={supportEffectiveness.containmentRate !== null ? `${supportEffectiveness.containmentRate.toFixed(0)}%` : '—'}
                                icon="target"
                                color="green"
                            />
                            <MetricCard
                                label="FCR"
                                value={supportEffectiveness.firstCallResolution !== null ? `${supportEffectiveness.firstCallResolution.toFixed(0)}%` : '—'}
                                icon="check"
                                color="blue"
                            />
                            <MetricCard
                                label="Cost Savings"
                                value={businessOutcomes.costSavings !== null ? `$${(businessOutcomes.costSavings / 1000).toFixed(0)}K` : '—'}
                                icon="dollar-sign"
                                color="green"
                            />
                            <MetricCard
                                label="Automation"
                                value={businessOutcomes.automationRate !== null ? `${businessOutcomes.automationRate.toFixed(0)}%` : '—'}
                                icon="zap"
                                color="purple"
                            />
                        </div>

                        {/* Support & Business Summary */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card title="Support Effectiveness">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-dark-800 rounded-xl text-center">
                                            <p className="text-2xl font-bold text-green-400">
                                                {supportEffectiveness.containmentRate?.toFixed(0) || '—'}%
                                            </p>
                                            <p className="text-sm text-dark-400">Containment Rate</p>
                                        </div>
                                        <div className="p-4 bg-dark-800 rounded-xl text-center">
                                            <p className="text-2xl font-bold text-blue-400">
                                                {supportEffectiveness.avgHandleTime || '—'}s
                                            </p>
                                            <p className="text-sm text-dark-400">Avg Handle Time</p>
                                        </div>
                                    </div>
                                </div>
                            </Card>

                            <Card title="Business Outcomes">
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-dark-800 rounded-xl text-center">
                                            <p className="text-2xl font-bold text-primary-400">
                                                {businessOutcomes.callVolume?.total?.toLocaleString() || '0'}
                                            </p>
                                            <p className="text-sm text-dark-400">Total Calls</p>
                                        </div>
                                        <div className="p-4 bg-dark-800 rounded-xl text-center">
                                            <p className="text-2xl font-bold text-purple-400">
                                                {businessOutcomes.automationRate?.toFixed(0) || '—'}%
                                            </p>
                                            <p className="text-sm text-dark-400">Automation Rate</p>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Peak Hours Chart */}
                        {businessOutcomes.peakHours && businessOutcomes.peakHours.length > 0 && (
                            <Card title="Call Volume by Hour">
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={businessOutcomes.peakHours}>
                                            <defs>
                                                <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                            <XAxis
                                                dataKey="hour"
                                                stroke="#94a3b8"
                                                fontSize={10}
                                                tickFormatter={(h) => `${h}:00`}
                                            />
                                            <YAxis stroke="#94a3b8" fontSize={10} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                                labelFormatter={(h) => `${h}:00`}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="volume"
                                                stroke="#3b82f6"
                                                fill="url(#volumeGradient)"
                                                strokeWidth={2}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>
                        )}
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
