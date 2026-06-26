import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner, EmptyState } from '../components/common';
import { TicketsByPriorityChart } from '../components/dashboard/Charts';
import { dashboardApi } from '../services/api';
import { Ticket, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';

export function TicketsPage() {
    const { data: tickets, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-tickets'],
        queryFn: () => dashboardApi.getTickets(),
    });

    const metrics = tickets?.metrics;
    const ticketList = tickets?.tickets || [];

    if (isLoading) {
        return (
            <DashboardLayout title="Support Tickets" subtitle="Track and manage support requests">
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    const getPriorityClass = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'critical':
                return 'bg-red-600/20 text-red-400 border-red-500/30';
            case 'high':
                return 'bg-orange-600/20 text-orange-400 border-orange-500/30';
            case 'medium':
                return 'bg-yellow-600/20 text-yellow-400 border-yellow-500/30';
            case 'low':
                return 'bg-green-600/20 text-green-400 border-green-500/30';
            default:
                return 'bg-dark-600/20 text-dark-400 border-dark-500/30';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'resolved':
            case 'closed':
                return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'open':
                return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
            case 'in_progress':
            case 'pending':
                return <Clock className="w-4 h-4 text-blue-400" />;
            default:
                return <XCircle className="w-4 h-4 text-dark-400" />;
        }
    };

    const getStatusClass = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'resolved':
            case 'closed':
                return 'bg-green-600/20 text-green-400';
            case 'open':
                return 'bg-yellow-600/20 text-yellow-400';
            case 'in_progress':
            case 'pending':
                return 'bg-blue-600/20 text-blue-400';
            default:
                return 'bg-dark-600/20 text-dark-400';
        }
    };

    return (
        <DashboardLayout
            title="Support Tickets"
            subtitle="Track and manage support requests"
            onRefresh={() => refetch()}
        >
            <div className="fade-in space-y-6">
                {/* Top Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <MetricCard
                        label="Total Tickets"
                        value={metrics?.total_tickets || 0}
                        icon="ticket"
                        color="primary"
                    />
                    <MetricCard
                        label="Open"
                        value={metrics?.open_tickets || 0}
                        icon="alert-circle"
                        color="yellow"
                    />
                    <MetricCard
                        label="In Progress"
                        value={metrics?.pending_tickets || 0}
                        icon="clock"
                        color="blue"
                    />
                    <MetricCard
                        label="Resolved"
                        value={metrics?.resolved_tickets || 0}
                        icon="check-circle"
                        color="green"
                    />
                    <MetricCard
                        label="Critical"
                        value={metrics?.critical_tickets || 0}
                        icon="alert-triangle"
                        color="red"
                    />
                    <MetricCard
                        label="SLA Compliance"
                        value={`${metrics?.sla_compliance_percent || 0}%`}
                        icon="target"
                        color={
                            (metrics?.sla_compliance_percent || 0) >= 95
                                ? 'green'
                                : (metrics?.sla_compliance_percent || 0) >= 80
                                    ? 'yellow'
                                    : 'red'
                        }
                    />
                </div>

                {/* Status breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="text-center">
                        <div className="text-3xl font-bold text-yellow-400">{metrics?.open_tickets || 0}</div>
                        <div className="text-sm text-dark-400 mt-1">Open Tickets</div>
                        <div className="text-xs text-dark-500 mt-2">Need attention</div>
                    </Card>
                    <Card className="text-center">
                        <div className="text-3xl font-bold text-blue-400">{metrics?.pending_tickets || 0}</div>
                        <div className="text-sm text-dark-400 mt-1">In Progress</div>
                        <div className="text-xs text-dark-500 mt-2">Being worked on</div>
                    </Card>
                    <Card className="text-center">
                        <div className="text-3xl font-bold text-green-400">{metrics?.resolved_tickets || 0}</div>
                        <div className="text-sm text-dark-400 mt-1">Resolved</div>
                        <div className="text-xs text-dark-500 mt-2">Completed successfully</div>
                    </Card>
                    <Card className="text-center">
                        <div className="text-3xl font-bold text-purple-400">
                            {metrics?.avg_resolution_time_hours?.toFixed(1) || 0}h
                        </div>
                        <div className="text-sm text-dark-400 mt-1">Avg Resolution</div>
                        <div className="text-xs text-dark-500 mt-2">Time to close</div>
                    </Card>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TicketsByPriorityChart
                        title="Tickets by Priority"
                        data={metrics?.tickets_by_priority || []}
                    />
                    <Card title="Priority Distribution">
                        <div className="space-y-4">
                            {(metrics?.tickets_by_priority || []).map((item, idx) => (
                                <div key={idx} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`w-3 h-3 rounded-full ${item.priority === 'critical'
                                                    ? 'bg-red-500'
                                                    : item.priority === 'high'
                                                        ? 'bg-orange-500'
                                                        : item.priority === 'medium'
                                                            ? 'bg-yellow-500'
                                                            : 'bg-green-500'
                                                }`}
                                        />
                                        <span className="capitalize">{item.priority}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="w-32 h-2 bg-dark-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${item.priority === 'critical'
                                                        ? 'bg-red-500'
                                                        : item.priority === 'high'
                                                            ? 'bg-orange-500'
                                                            : item.priority === 'medium'
                                                                ? 'bg-yellow-500'
                                                                : 'bg-green-500'
                                                    }`}
                                                style={{
                                                    width: `${Math.min(
                                                        100,
                                                        ((item.count || 0) / (metrics?.total_tickets || 1)) * 100
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                        <span className="text-dark-400 w-8 text-right">{item.count || 0}</span>
                                    </div>
                                </div>
                            ))}
                            {(!metrics?.tickets_by_priority || metrics.tickets_by_priority.length === 0) && (
                                <div className="text-center text-dark-400 py-4">No priority data available</div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Tickets Table */}
                <Card title="Recent Tickets">
                    {ticketList.length === 0 ? (
                        <EmptyState
                            message="No tickets found"
                            icon={<Ticket className="w-12 h-12 text-dark-400" />}
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-dark-400 text-sm border-b border-dark-800">
                                        <th className="pb-3">ID</th>
                                        <th className="pb-3">Subject</th>
                                        <th className="pb-3">Priority</th>
                                        <th className="pb-3">Status</th>
                                        <th className="pb-3">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {ticketList.slice(0, 15).map((ticket) => (
                                        <tr key={ticket.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                                            <td className="py-3 pr-4 font-mono text-xs text-dark-300">
                                                #{ticket.id}
                                            </td>
                                            <td className="py-3 pr-4 max-w-xs truncate">
                                                {ticket.subject || ticket.issue_summary || 'No subject'}
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span
                                                    className={`px-2 py-1 rounded text-xs border ${getPriorityClass(
                                                        ticket.priority
                                                    )}`}
                                                >
                                                    {ticket.priority || 'medium'}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4">
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${getStatusClass(
                                                        ticket.status
                                                    )}`}
                                                >
                                                    {getStatusIcon(ticket.status)}
                                                    {ticket.status}
                                                </span>
                                            </td>
                                            <td className="py-3 text-dark-400">
                                                {ticket.created_at
                                                    ? new Date(ticket.created_at).toLocaleDateString()
                                                    : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>
        </DashboardLayout>
    );
}
