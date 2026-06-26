import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Phone,
    Clock,
    MessageCircle,
    Ticket,
    CheckCircle,
    AlertCircle,
    TrendingUp,
    Mic,
    History,
    HelpCircle,
    LogOut,
    User,
    Headphones,
    RefreshCw,
    Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context';
import { VoiceWidget } from '../components/voice';
import { wsService } from '../services/websocket';
import { dashboardApi } from '../services/api';

interface CallHistory {
    id: string;
    date: string;
    duration: number;
    status: 'completed' | 'missed' | 'escalated';
    summary: string;
    agentType?: string;
    sentiment?: string;
    aiResolved?: boolean;
}

interface TicketSummary {
    id: string;
    ticketId?: number;
    title: string;
    status: string;
    createdAt: string;
    priority: string;
    description?: string;
}

interface RequesterStats {
    totalCalls: number;
    callsThisMonth: number;
    avgWaitTime: string;
    openTickets: number;
    resolvedThisMonth: number;
}

export function RequesterDashboard() {
    const navigate = useNavigate();
    const { user, role, logout, voicePermissions } = useAuth();

    // Redirect if not requester
    useEffect(() => {
        if (role !== 'requester') {
            navigate(role === 'admin' ? '/overview' : '/agent');
        }
    }, [role, navigate]);

    const [isConnected, setIsConnected] = useState(false);
    const [activeCall, setActiveCall] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Live data from API
    const [stats, setStats] = useState<RequesterStats>({
        totalCalls: 0,
        callsThisMonth: 0,
        avgWaitTime: '0:00',
        openTickets: 0,
        resolvedThisMonth: 0,
    });

    const [recentCalls, setRecentCalls] = useState<CallHistory[]>([]);
    const [tickets, setTickets] = useState<TicketSummary[]>([]);

    // Fetch dashboard data
    const fetchDashboardData = useCallback(async (showRefresh = false) => {
        try {
            if (showRefresh) setIsRefreshing(true);
            setError(null);

            const data = await dashboardApi.getRequesterDashboard();

            setStats({
                totalCalls: data.stats.totalCalls,
                callsThisMonth: data.stats.callsThisMonth,
                avgWaitTime: data.stats.avgWaitTime,
                openTickets: data.stats.openTickets,
                resolvedThisMonth: data.stats.resolvedThisMonth,
            });

            setRecentCalls(data.recentCalls.map(call => ({
                id: call.id,
                date: call.date,
                duration: call.duration,
                status: call.status as 'completed' | 'missed' | 'escalated',
                summary: call.summary,
                agentType: call.agentType,
                sentiment: call.sentiment,
                aiResolved: call.aiResolved,
            })));

            setTickets(data.tickets.map(ticket => ({
                id: ticket.id,
                ticketId: ticket.ticketId,
                title: ticket.title,
                status: ticket.status,
                createdAt: ticket.createdAt,
                priority: ticket.priority,
                description: ticket.description,
            })));

        } catch (err: any) {
            console.error('Failed to fetch requester dashboard:', err);
            setError(err.message || 'Failed to load dashboard data');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    // Initial data load
    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // WebSocket connection for live updates
    useEffect(() => {
        wsService.connect();

        const checkConnection = setInterval(() => {
            setIsConnected(wsService.isConnected());
        }, 1000);

        // Listen for call events
        const unsubCalls = wsService.on('call:update', (data: any) => {
            if (data.status === 'in-progress') {
                setActiveCall(true);
            } else if (data.status === 'completed' || data.status === 'failed') {
                setActiveCall(false);
                // Refresh data after call ends
                fetchDashboardData();
            }
        });

        // Listen for ticket updates
        const unsubTickets = wsService.on('ticket:update', () => {
            fetchDashboardData();
        });

        // Auto-refresh every 30 seconds
        const refreshInterval = setInterval(() => {
            fetchDashboardData();
        }, 30000);

        return () => {
            clearInterval(checkConnection);
            clearInterval(refreshInterval);
            unsubCalls();
            unsubTickets();
        };
    }, [fetchDashboardData]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleRefresh = () => {
        fetchDashboardData(true);
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed':
            case 'resolved':
                return 'text-emerald-400 bg-emerald-500/10';
            case 'in-progress':
                return 'text-blue-400 bg-blue-500/10';
            case 'escalated':
                return 'text-orange-400 bg-orange-500/10';
            case 'open':
                return 'text-yellow-400 bg-yellow-500/10';
            case 'missed':
                return 'text-red-400 bg-red-500/10';
            default:
                return 'text-gray-400 bg-gray-500/10';
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'high':
                return 'text-red-400';
            case 'medium':
                return 'text-yellow-400';
            case 'low':
                return 'text-green-400';
            default:
                return 'text-gray-400';
        }
    };

    return (
        <div className="min-h-screen bg-dark-950">
            {/* Header */}
            <header className="bg-dark-900 border-b border-dark-700 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                                <Headphones className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-white">CallSphere Demo</h1>
                                <p className="text-xs text-dark-400">Support Portal</p>
                            </div>
                        </div>

                        {/* Connection Status */}
                        <div className="flex items-center gap-2">
                            <span className={clsx(
                                'w-2 h-2 rounded-full',
                                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                            )} />
                            <span className="text-xs text-dark-400">
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>

                        {/* User Menu */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                    <User className="w-4 h-4 text-emerald-400" />
                                </div>
                                <span className="text-sm text-white">{user?.fullName || 'User'}</span>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                        <span className="ml-3 text-white">Loading your dashboard...</span>
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div className="glass rounded-2xl p-6 mb-8 border border-red-500/30">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-6 h-6 text-red-400" />
                            <div>
                                <h3 className="font-semibold text-white">Failed to load dashboard</h3>
                                <p className="text-sm text-dark-400">{error}</p>
                            </div>
                            <button
                                onClick={() => fetchDashboardData(true)}
                                className="ml-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {!isLoading && (
                    <>
                        {/* Welcome Section */}
                        <div className="mb-8 flex items-center justify-between">
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-2">
                                    Welcome back, {user?.fullName?.split(' ')[0] || 'there'}!
                                </h2>
                                <p className="text-dark-400">
                                    Need help? Start a voice call or check your tickets below.
                                </p>
                            </div>
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
                                {isRefreshing ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="glass rounded-2xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                        <Phone className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <span className="text-2xl font-bold text-white">{stats.totalCalls}</span>
                                </div>
                                <p className="text-sm text-dark-400">Total Calls</p>
                            </div>

                            <div className="glass rounded-2xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                        <Clock className="w-5 h-5 text-emerald-400" />
                                    </div>
                                    <span className="text-2xl font-bold text-white">{stats.avgWaitTime}</span>
                                </div>
                                <p className="text-sm text-dark-400">Avg Wait Time</p>
                            </div>

                            <div className="glass rounded-2xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                                        <Ticket className="w-5 h-5 text-yellow-400" />
                                    </div>
                                    <span className="text-2xl font-bold text-white">{stats.openTickets}</span>
                                </div>
                                <p className="text-sm text-dark-400">Open Tickets</p>
                            </div>

                            <div className="glass rounded-2xl p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                        <CheckCircle className="w-5 h-5 text-purple-400" />
                                    </div>
                                    <span className="text-2xl font-bold text-white">{stats.resolvedThisMonth}</span>
                                </div>
                                <p className="text-sm text-dark-400">Resolved This Month</p>
                            </div>
                        </div>

                        {/* Main Action - Voice Support */}
                        <div className="glass rounded-3xl p-6 mb-8 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-teal-500/10" />
                            <div className="relative flex flex-col md:flex-row items-center justify-between gap-6">
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                        <Mic className="w-6 h-6 text-emerald-400" />
                                        Voice Support
                                    </h3>
                                    <p className="text-dark-300 mb-4">
                                        Talk directly with our AI assistant for immediate help.
                                        Available 24/7 for quick resolutions.
                                    </p>
                                    <ul className="space-y-2 text-sm text-dark-400">
                                        <li className="flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            Instant connection - no wait times
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            AI-powered assistance
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                                            Escalation to human agent if needed
                                        </li>
                                    </ul>
                                </div>
                                <div className="flex flex-col items-center gap-3">
                                    <div
                                        className={clsx(
                                            'w-24 h-24 rounded-full flex items-center justify-center transition-all',
                                            activeCall
                                                ? 'bg-red-500 animate-pulse'
                                                : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                                        )}
                                    >
                                        {activeCall ? (
                                            <Phone className="w-10 h-10 text-white animate-bounce" />
                                        ) : (
                                            <Mic className="w-10 h-10 text-white" />
                                        )}
                                    </div>
                                    <span className="text-sm font-medium text-white">
                                        {activeCall ? 'Call in Progress' : 'Use Phone Icon Below'}
                                    </span>
                                    <span className="text-xs text-dark-400">
                                        Click the floating phone button to start a call
                                    </span>
                                    <span className="text-xs text-dark-500">
                                        Max {voicePermissions.maxCallDuration} min per call
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-8">
                            {/* Recent Calls */}
                            <div className="glass rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <History className="w-5 h-5 text-blue-400" />
                                        Recent Calls
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {recentCalls.map((call) => (
                                        <div key={call.id} className="p-3 rounded-xl bg-dark-800/50 hover:bg-dark-800 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm text-white font-medium">{call.summary}</span>
                                                <span className={clsx(
                                                    'text-xs px-2 py-0.5 rounded-full capitalize',
                                                    getStatusColor(call.status)
                                                )}>
                                                    {call.status}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-dark-400">
                                                <span>{call.date}</span>
                                                <span>{formatDuration(call.duration)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* My Tickets */}
                            <div className="glass rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <Ticket className="w-5 h-5 text-yellow-400" />
                                        My Tickets
                                    </h3>
                                </div>
                                <div className="space-y-3">
                                    {tickets.map((ticket) => (
                                        <div key={ticket.id} className="p-3 rounded-xl bg-dark-800/50 hover:bg-dark-800 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-sm text-white font-medium">{ticket.title}</span>
                                                <span className={clsx(
                                                    'text-xs px-2 py-0.5 rounded-full capitalize',
                                                    getStatusColor(ticket.status)
                                                )}>
                                                    {ticket.status.replace('-', ' ')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 text-xs text-dark-400">
                                                <span>{ticket.id}</span>
                                                <span>{ticket.createdAt}</span>
                                                <span className={getPriorityColor(ticket.priority)}>
                                                    {ticket.priority} priority
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Help Section */}
                        <div className="mt-8 glass rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                                <HelpCircle className="w-5 h-5 text-purple-400" />
                                Quick Help
                            </h3>
                            <div className="grid sm:grid-cols-3 gap-4">
                                <button className="p-4 rounded-xl bg-dark-800/50 hover:bg-dark-800 transition-colors text-left">
                                    <MessageCircle className="w-8 h-8 text-blue-400 mb-2" />
                                    <h4 className="font-medium text-white">FAQ</h4>
                                    <p className="text-xs text-dark-400">Find answers to common questions</p>
                                </button>
                                <button className="p-4 rounded-xl bg-dark-800/50 hover:bg-dark-800 transition-colors text-left">
                                    <TrendingUp className="w-8 h-8 text-emerald-400 mb-2" />
                                    <h4 className="font-medium text-white">Getting Started</h4>
                                    <p className="text-xs text-dark-400">Learn how to use our platform</p>
                                </button>
                                <button className="p-4 rounded-xl bg-dark-800/50 hover:bg-dark-800 transition-colors text-left">
                                    <AlertCircle className="w-8 h-8 text-yellow-400 mb-2" />
                                    <h4 className="font-medium text-white">Report Issue</h4>
                                    <p className="text-xs text-dark-400">Let us know about problems</p>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </main>

            {/* Voice Widget - Floating */}
            <VoiceWidget />
        </div>
    );
}
