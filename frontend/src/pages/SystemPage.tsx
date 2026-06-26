import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout';
import { MetricCard, GaugeCard, LatencyCard, Card, LoadingSpinner } from '../components/common';
import { dashboardApi } from '../services/api';
import { Server, HardDrive, Database, Zap, AlertTriangle } from 'lucide-react';

export function SystemPage() {
    const { data: system, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-system'],
        queryFn: () => dashboardApi.getSystemHealth(),
        refetchInterval: 30000, // Refresh every 30s for real-time health
    });

    const metrics = system?.metrics;

    if (isLoading) {
        return (
            <DashboardLayout title="System Health" subtitle="Monitor system performance and health">
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    const getHealthStatus = (value: number, warning: number, critical: number) => {
        if (value >= critical) return 'critical';
        if (value >= warning) return 'warning';
        return 'healthy';
    };

    const cpuStatus = getHealthStatus(metrics?.cpu_usage_percent || 0, 70, 90);
    const memoryStatus = getHealthStatus(metrics?.memory_usage_percent || 0, 80, 95);
    const diskStatus = getHealthStatus(metrics?.disk_usage_percent || 0, 80, 95);

    return (
        <DashboardLayout
            title="System Health"
            subtitle="Monitor system performance and health"
            onRefresh={() => refetch()}
        >
            <div className="fade-in space-y-6">
                {/* Quick Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <MetricCard
                        label="System Status"
                        value={metrics?.status || 'Unknown'}
                        icon="activity"
                        color={
                            metrics?.status === 'healthy'
                                ? 'green'
                                : metrics?.status === 'degraded'
                                    ? 'yellow'
                                    : 'red'
                        }
                    />
                    <MetricCard
                        label="Uptime"
                        value={metrics?.uptime || '0h'}
                        icon="clock"
                        color="blue"
                    />
                    <MetricCard
                        label="Active Sessions"
                        value={metrics?.active_sessions || 0}
                        icon="users"
                        color="purple"
                    />
                    <MetricCard
                        label="API Requests/min"
                        value={metrics?.requests_per_minute || 0}
                        icon="zap"
                        color="orange"
                    />
                    <MetricCard
                        label="Error Rate"
                        value={`${metrics?.error_rate_percent || 0}%`}
                        icon="alert-triangle"
                        color={
                            (metrics?.error_rate_percent || 0) > 5
                                ? 'red'
                                : (metrics?.error_rate_percent || 0) > 1
                                    ? 'yellow'
                                    : 'green'
                        }
                    />
                    <MetricCard
                        label="DB Connections"
                        value={metrics?.db_connections || 0}
                        icon="database"
                        color="blue"
                    />
                </div>

                {/* Resource Gauges */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <GaugeCard
                        title="CPU Usage"
                        value={metrics?.cpu_usage_percent || 0}
                        max={100}
                        unit="%"
                        color={
                            cpuStatus === 'critical'
                                ? 'red'
                                : cpuStatus === 'warning'
                                    ? 'yellow'
                                    : 'green'
                        }
                    />
                    <GaugeCard
                        title="Memory Usage"
                        value={metrics?.memory_usage_percent || 0}
                        max={100}
                        unit="%"
                        color={
                            memoryStatus === 'critical'
                                ? 'red'
                                : memoryStatus === 'warning'
                                    ? 'yellow'
                                    : 'green'
                        }
                    />
                    <GaugeCard
                        title="Disk Usage"
                        value={metrics?.disk_usage_percent || 0}
                        max={100}
                        unit="%"
                        color={
                            diskStatus === 'critical'
                                ? 'red'
                                : diskStatus === 'warning'
                                    ? 'yellow'
                                    : 'green'
                        }
                    />
                </div>

                {/* API Latencies */}
                <Card title="API Latencies">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <LatencyCard
                            label="Average"
                            value={metrics?.avg_response_time_ms || 0}
                        />
                        <LatencyCard
                            label="P50"
                            value={metrics?.p50_latency_ms || 0}
                        />
                        <LatencyCard
                            label="P95"
                            value={metrics?.p95_latency_ms || 0}
                        />
                        <LatencyCard
                            label="P99"
                            value={metrics?.p99_latency_ms || 0}
                        />
                    </div>
                </Card>

                {/* Services Status */}
                <Card title="Service Health">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            {
                                name: 'API Server',
                                status: metrics?.api_status || 'unknown',
                                icon: <Server className="w-5 h-5" />,
                            },
                            {
                                name: 'Database',
                                status: metrics?.db_status || 'unknown',
                                icon: <Database className="w-5 h-5" />,
                            },
                            {
                                name: 'AI Service',
                                status: metrics?.ai_status || 'unknown',
                                icon: <Zap className="w-5 h-5" />,
                            },
                            {
                                name: 'Cache',
                                status: metrics?.cache_status || 'unknown',
                                icon: <HardDrive className="w-5 h-5" />,
                            },
                        ].map((service, idx) => (
                            <div
                                key={idx}
                                className={`p-4 rounded-lg border ${service.status === 'healthy' || service.status === 'connected'
                                        ? 'bg-green-600/10 border-green-500/30'
                                        : service.status === 'degraded'
                                            ? 'bg-yellow-600/10 border-yellow-500/30'
                                            : service.status === 'down' || service.status === 'error'
                                                ? 'bg-red-600/10 border-red-500/30'
                                                : 'bg-dark-800 border-dark-700'
                                    }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div
                                            className={`p-2 rounded-lg ${service.status === 'healthy' || service.status === 'connected'
                                                    ? 'bg-green-600/20 text-green-400'
                                                    : service.status === 'degraded'
                                                        ? 'bg-yellow-600/20 text-yellow-400'
                                                        : service.status === 'down' || service.status === 'error'
                                                            ? 'bg-red-600/20 text-red-400'
                                                            : 'bg-dark-700 text-dark-400'
                                                }`}
                                        >
                                            {service.icon}
                                        </div>
                                        <div>
                                            <div className="font-medium">{service.name}</div>
                                            <div
                                                className={`text-sm capitalize ${service.status === 'healthy' || service.status === 'connected'
                                                        ? 'text-green-400'
                                                        : service.status === 'degraded'
                                                            ? 'text-yellow-400'
                                                            : service.status === 'down' || service.status === 'error'
                                                                ? 'text-red-400'
                                                                : 'text-dark-400'
                                                    }`}
                                            >
                                                {service.status}
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        className={`w-3 h-3 rounded-full ${service.status === 'healthy' || service.status === 'connected'
                                                ? 'bg-green-400 animate-pulse'
                                                : service.status === 'degraded'
                                                    ? 'bg-yellow-400 animate-pulse'
                                                    : service.status === 'down' || service.status === 'error'
                                                        ? 'bg-red-400'
                                                        : 'bg-dark-500'
                                            }`}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Alerts & Warnings */}
                {metrics?.alerts && metrics.alerts.length > 0 && (
                    <Card title="Active Alerts">
                        <div className="space-y-3">
                            {metrics.alerts.map((alert, idx) => (
                                <div
                                    key={idx}
                                    className={`p-4 rounded-lg border flex items-start gap-3 ${alert.severity === 'critical'
                                            ? 'bg-red-600/10 border-red-500/30'
                                            : alert.severity === 'warning'
                                                ? 'bg-yellow-600/10 border-yellow-500/30'
                                                : 'bg-blue-600/10 border-blue-500/30'
                                        }`}
                                >
                                    <AlertTriangle
                                        className={`w-5 h-5 flex-shrink-0 ${alert.severity === 'critical'
                                                ? 'text-red-400'
                                                : alert.severity === 'warning'
                                                    ? 'text-yellow-400'
                                                    : 'text-blue-400'
                                            }`}
                                    />
                                    <div>
                                        <div className="font-medium">{alert.title}</div>
                                        <div className="text-sm text-dark-400 mt-1">{alert.message}</div>
                                        <div className="text-xs text-dark-500 mt-2">
                                            {alert.timestamp
                                                ? new Date(alert.timestamp).toLocaleString()
                                                : 'Just now'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* System Info */}
                <Card title="System Information">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                        <div>
                            <div className="text-dark-400">Version</div>
                            <div className="font-mono mt-1">{metrics?.version || 'v2.0.0'}</div>
                        </div>
                        <div>
                            <div className="text-dark-400">Environment</div>
                            <div className="font-mono mt-1">{metrics?.environment || 'production'}</div>
                        </div>
                        <div>
                            <div className="text-dark-400">Node</div>
                            <div className="font-mono mt-1">{metrics?.node_version || 'v20.x'}</div>
                        </div>
                        <div>
                            <div className="text-dark-400">Last Deploy</div>
                            <div className="font-mono mt-1">
                                {metrics?.last_deploy
                                    ? new Date(metrics.last_deploy).toLocaleDateString()
                                    : 'Unknown'}
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
