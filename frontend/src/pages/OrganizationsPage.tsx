import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner, EmptyState } from '../components/common';
import { dashboardApi } from '../services/api';
import { Building2, Users, Monitor, MapPin, Phone } from 'lucide-react';

export function OrganizationsPage() {
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-organizations'],
        queryFn: () => dashboardApi.getOrganizations(),
    });

    const organizations = data?.organizations || [];
    const metrics = data?.metrics;

    if (isLoading) {
        return (
            <DashboardLayout title="Organizations" subtitle="Manage customer organizations">
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Organizations"
            subtitle="Manage customer organizations"
            onRefresh={() => refetch()}
        >
            <div className="fade-in space-y-6">
                {/* Top Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                        label="Total Organizations"
                        value={metrics?.total_organizations || organizations.length}
                        icon="users"
                        color="primary"
                    />
                    <MetricCard
                        label="Active"
                        value={metrics?.active_organizations || 0}
                        icon="check-circle"
                        color="green"
                    />
                    <MetricCard
                        label="Total Devices"
                        value={metrics?.total_devices || 0}
                        icon="monitor"
                        color="blue"
                    />
                    <MetricCard
                        label="Total Contacts"
                        value={metrics?.total_contacts || 0}
                        icon="user-plus"
                        color="purple"
                    />
                </div>

                {/* Organizations Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {organizations.map((org) => (
                        <Card key={org.id} className="hover:border-primary-500/50 transition-colors">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-lg bg-primary-600/20">
                                        <Building2 className="w-6 h-6 text-primary-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold">{org.org_name}</h3>
                                        <p className="text-sm text-dark-400">{org.industry || 'No industry'}</p>
                                    </div>
                                </div>
                                <span
                                    className={`px-2 py-1 rounded text-xs ${org.status === 'active'
                                            ? 'bg-green-600/20 text-green-400'
                                            : 'bg-dark-600/20 text-dark-400'
                                        }`}
                                >
                                    {org.status || 'active'}
                                </span>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-dark-400">
                                        <Monitor className="w-4 h-4" />
                                        Devices
                                    </span>
                                    <span className="font-mono">{org.device_count || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-dark-400">
                                        <Users className="w-4 h-4" />
                                        Contacts
                                    </span>
                                    <span className="font-mono">{org.contact_count || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-dark-400">
                                        <MapPin className="w-4 h-4" />
                                        Locations
                                    </span>
                                    <span className="font-mono">{org.location_count || 0}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center gap-2 text-dark-400">
                                        <Phone className="w-4 h-4" />
                                        Calls
                                    </span>
                                    <span className="font-mono">{org.call_count || 0}</span>
                                </div>
                            </div>

                            {org.address && (
                                <div className="mt-4 pt-4 border-t border-dark-700">
                                    <div className="text-xs text-dark-400">Address</div>
                                    <div className="text-sm mt-1">{org.address}</div>
                                </div>
                            )}
                        </Card>
                    ))}
                </div>

                {organizations.length === 0 && (
                    <EmptyState
                        message="No organizations found"
                        icon={<Building2 className="w-12 h-12 text-dark-400" />}
                    />
                )}

                {/* Organizations Table */}
                {organizations.length > 0 && (
                    <Card title="Organization Details">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-dark-400 border-b border-dark-800">
                                        <th className="pb-3">Name</th>
                                        <th className="pb-3">Industry</th>
                                        <th className="pb-3">Devices</th>
                                        <th className="pb-3">Contacts</th>
                                        <th className="pb-3">Status</th>
                                        <th className="pb-3">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {organizations.map((org) => (
                                        <tr key={org.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                                            <td className="py-3 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="w-4 h-4 text-primary-400" />
                                                    <span className="font-medium">{org.org_name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4 text-dark-300">{org.industry || '-'}</td>
                                            <td className="py-3 pr-4 font-mono">{org.device_count || 0}</td>
                                            <td className="py-3 pr-4 font-mono">{org.contact_count || 0}</td>
                                            <td className="py-3 pr-4">
                                                <span
                                                    className={`px-2 py-1 rounded text-xs ${org.status === 'active'
                                                            ? 'bg-green-600/20 text-green-400'
                                                            : 'bg-dark-600/20 text-dark-400'
                                                        }`}
                                                >
                                                    {org.status || 'active'}
                                                </span>
                                            </td>
                                            <td className="py-3 text-dark-400">
                                                {org.created_at
                                                    ? new Date(org.created_at).toLocaleDateString()
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
}
