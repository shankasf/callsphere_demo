import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner, EmptyState } from '../components/common';
import { DeviceStatusChart, OSDistributionChart } from '../components/dashboard/Charts';
import { dashboardApi } from '../services/api';
import { Monitor, Wifi, WifiOff, Laptop, Server, HardDrive } from 'lucide-react';

export function DevicesPage() {
    const { data: devices, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-devices'],
        queryFn: () => dashboardApi.getDevices(),
    });

    const metrics = devices?.metrics;
    const deviceList = devices?.devices || [];

    if (isLoading) {
        return (
            <DashboardLayout title="Device Management" subtitle="Monitor and manage connected devices">
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    const getStatusClass = (isOnline: boolean) => {
        return isOnline
            ? 'bg-green-600/20 text-green-400 border-green-500/30'
            : 'bg-red-600/20 text-red-400 border-red-500/30';
    };

    const getDeviceIcon = (type?: string) => {
        switch (type?.toLowerCase()) {
            case 'laptop':
                return <Laptop className="w-4 h-4" />;
            case 'server':
                return <Server className="w-4 h-4" />;
            case 'desktop':
                return <Monitor className="w-4 h-4" />;
            default:
                return <HardDrive className="w-4 h-4" />;
        }
    };

    const onlinePercent = metrics?.total_devices
        ? Math.round(((metrics?.online_devices || 0) / metrics.total_devices) * 100)
        : 0;

    return (
        <DashboardLayout
            title="Device Management"
            subtitle="Monitor and manage connected devices"
            onRefresh={() => refetch()}
        >
            <div className="fade-in space-y-6">
                {/* Top Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <MetricCard
                        label="Total Devices"
                        value={metrics?.total_devices || 0}
                        icon="monitor"
                        color="primary"
                    />
                    <MetricCard
                        label="Online"
                        value={metrics?.online_devices || 0}
                        icon="check-circle"
                        color="green"
                    />
                    <MetricCard
                        label="Offline"
                        value={metrics?.offline_devices || 0}
                        icon="x-circle"
                        color="red"
                    />
                    <MetricCard
                        label="Uptime"
                        value={`${onlinePercent}%`}
                        icon="activity"
                        color={onlinePercent >= 90 ? 'green' : onlinePercent >= 70 ? 'yellow' : 'red'}
                    />
                    <MetricCard
                        label="Organizations"
                        value={metrics?.devices_by_org?.length || 0}
                        icon="users"
                        color="blue"
                    />
                    <MetricCard
                        label="OS Types"
                        value={metrics?.devices_by_os?.length || 0}
                        icon="cpu"
                        color="purple"
                    />
                </div>

                {/* Status Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="flex items-center gap-4">
                        <div className="p-4 rounded-lg bg-green-600/20">
                            <Wifi className="w-8 h-8 text-green-400" />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-green-400">
                                {metrics?.online_devices || 0}
                            </div>
                            <div className="text-sm text-dark-400">Online Devices</div>
                            <div className="text-xs text-green-400/60 mt-1">
                                {onlinePercent}% of total
                            </div>
                        </div>
                    </Card>

                    <Card className="flex items-center gap-4">
                        <div className="p-4 rounded-lg bg-red-600/20">
                            <WifiOff className="w-8 h-8 text-red-400" />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-red-400">
                                {metrics?.offline_devices || 0}
                            </div>
                            <div className="text-sm text-dark-400">Offline Devices</div>
                            <div className="text-xs text-red-400/60 mt-1">
                                {100 - onlinePercent}% of total
                            </div>
                        </div>
                    </Card>

                    <Card className="flex items-center gap-4">
                        <div className="p-4 rounded-lg bg-blue-600/20">
                            <Monitor className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-blue-400">
                                {metrics?.total_devices || 0}
                            </div>
                            <div className="text-sm text-dark-400">Total Devices</div>
                            <div className="text-xs text-blue-400/60 mt-1">
                                Across {metrics?.devices_by_org?.length || 0} orgs
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <DeviceStatusChart
                        title="Devices by Organization"
                        data={metrics?.devices_by_org || []}
                    />
                    <OSDistributionChart
                        title="OS Distribution"
                        data={metrics?.devices_by_os || []}
                    />
                </div>

                {/* Devices Table */}
                <Card title="Device List">
                    {deviceList.length === 0 ? (
                        <EmptyState
                            message="No devices found"
                            icon={<Monitor className="w-12 h-12 text-dark-400" />}
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-dark-400 text-sm border-b border-dark-800">
                                        <th className="pb-3">Device Name</th>
                                        <th className="pb-3">Type</th>
                                        <th className="pb-3">Organization</th>
                                        <th className="pb-3">OS</th>
                                        <th className="pb-3">Status</th>
                                        <th className="pb-3">Last Seen</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {deviceList.slice(0, 20).map((device) => (
                                        <tr
                                            key={device.id}
                                            className="border-b border-dark-800 hover:bg-dark-800/50"
                                        >
                                            <td className="py-3 pr-4">
                                                <div className="flex items-center gap-2">
                                                    {getDeviceIcon(device.device_type)}
                                                    <span className="font-medium">
                                                        {device.device_name || `Device ${device.id}`}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4 text-dark-300 capitalize">
                                                {device.device_type || 'Unknown'}
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span className="px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400">
                                                    {device.organization?.org_name || 'Unknown Org'}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4 text-dark-300">
                                                {device.os_type || 'Unknown'}
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${getStatusClass(
                                                        device.is_online
                                                    )}`}
                                                >
                                                    {device.is_online ? (
                                                        <>
                                                            <Wifi className="w-3 h-3" /> Online
                                                        </>
                                                    ) : (
                                                        <>
                                                            <WifiOff className="w-3 h-3" /> Offline
                                                        </>
                                                    )}
                                                </span>
                                            </td>
                                            <td className="py-3 text-dark-400">
                                                {device.last_seen
                                                    ? new Date(device.last_seen).toLocaleString()
                                                    : 'Never'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Org Summary */}
                <Card title="Devices by Organization">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {(metrics?.devices_by_org || []).map((org, idx) => (
                            <div
                                key={idx}
                                className="p-4 bg-dark-800/50 rounded-lg border border-dark-700"
                            >
                                <div className="font-medium mb-2 truncate">{org.organization}</div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-dark-400">Total</span>
                                    <span className="font-mono">{org.device_count}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-1">
                                    <span className="text-green-400">Online</span>
                                    <span className="font-mono text-green-400">{org.online || 0}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm mt-1">
                                    <span className="text-red-400">Offline</span>
                                    <span className="font-mono text-red-400">{org.offline || 0}</span>
                                </div>
                                <div className="mt-3 h-2 bg-dark-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500"
                                        style={{
                                            width: `${org.device_count > 0
                                                    ? ((org.online || 0) / org.device_count) * 100
                                                    : 0
                                                }%`,
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                        {(!metrics?.devices_by_org || metrics.devices_by_org.length === 0) && (
                            <div className="col-span-full text-center text-dark-400 py-8">
                                No organization data available
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
