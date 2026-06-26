import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Phone,
    PhoneIncoming,
    PhoneOff,
    MessageCircle,
    CheckCircle,
    TrendingUp,
    Mic,
    MicOff,
    Users,
    Activity,
    Headphones,
    LogOut,
    User,
    Volume2,
    ArrowUpRight,
    Zap,
    Bot,
    Timer,
    RefreshCw,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context';
import { VoiceWidget } from '../components/voice';
import { wsService } from '../services/websocket';
import { dashboardApi } from '../services/api';

interface LiveCall {
    id: string;
    callerId: string;
    callerName: string;
    status: 'ringing' | 'in-progress' | 'on-hold';
    duration: number;
    agentType: string;
    canTakeover: boolean;
}

interface AgentMetrics {
    callsToday: number;
    avgHandleTime: string;
    resolutionRate: number;
    satisfaction: number;
    activeNow: number;
    queueLength: number;
}

interface RecentInteraction {
    id: string;
    callerName: string;
    type: 'call' | 'ticket' | 'escalation';
    status: 'completed' | 'pending' | 'escalated';
    timestamp: string;
    summary: string;
}

export function AgentDashboard() {
    const navigate = useNavigate();
    const { user, role, logout, voicePermissions } = useAuth();

    // Redirect if not agent or admin
    useEffect(() => {
        if (role === 'requester') {
            navigate('/requester');
        }
    }, [role, navigate]);

    const [isConnected, setIsConnected] = useState(false);
    const [onCall, setOnCall] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Live data from API and WebSocket
    const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);

    const [metrics, setMetrics] = useState<AgentMetrics>({
        callsToday: 0,
        avgHandleTime: '0:00',
        resolutionRate: 0,
        satisfaction: 0,
        activeNow: 0,
        queueLength: 0,
    });

    const [recentInteractions, setRecentInteractions] = useState<RecentInteraction[]>([]);

    // Fetch dashboard data
    const fetchDashboardData = useCallback(async (showRefresh = false) => {
        try {
            if (showRefresh) setIsRefreshing(true);
            setError(null);

            const data = await dashboardApi.getAgentDashboard();

            setMetrics({
                callsToday: data.metrics.callsToday,
                avgHandleTime: data.metrics.avgHandleTime,
                resolutionRate: data.metrics.resolutionRate,
                satisfaction: data.metrics.satisfaction,
                activeNow: data.metrics.activeNow,
                queueLength: data.metrics.queueLength,
            });

            setLiveCalls(data.liveCalls.map(call => ({
                id: call.id,
                callerId: call.callerId,
                callerName: call.callerName,
                status: call.status as 'ringing' | 'in-progress' | 'on-hold',
                duration: call.duration,
                agentType: call.agentType,
                canTakeover: call.canTakeover,
            })));

            setRecentInteractions(data.recentInteractions.map(interaction => ({
                id: interaction.id,
                callerName: interaction.callerName,
                type: interaction.wasEscalated ? 'escalation' : 'call',
                status: interaction.status === 'completed' ? 'completed' : (interaction.wasEscalated ? 'escalated' : 'pending'),
                timestamp: new Date(interaction.time).toLocaleTimeString(),
                summary: interaction.issue,
            })));

        } catch (err: any) {
            console.error('Failed to fetch agent dashboard:', err);
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

        // Listen for live call updates
        const unsubCalls = wsService.on('call:update', (data: any) => {
            setLiveCalls(prev => {
                const existing = prev.findIndex(c => c.id === data.callSid);
                if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = { ...updated[existing], ...data };
                    return updated;
                }
                return prev;
            });
            // Refresh dashboard on call status changes
            if (data.status === 'completed' || data.status === 'failed') {
                fetchDashboardData();
            }
        });

        // Listen for metrics updates
        const unsubMetrics = wsService.on('dashboard:update', (data: any) => {
            if (data.type === 'metrics') {
                setMetrics(prev => ({ ...prev, ...data.data }));
            }
        });

        // Listen for live calls broadcast
        const unsubLiveCalls = wsService.on('livecalls:update', (data: any) => {
            if (data.calls) {
                setLiveCalls(data.calls.map((call: any) => ({
                    id: call.session_id || call.id,
                    callerId: call.caller_phone || call.callerId,
                    callerName: call.caller_name || call.callerName || 'Unknown',
                    status: call.status === 'in_progress' ? 'in-progress' : call.status,
                    duration: call.duration || 0,
                    agentType: call.agent_type || 'AI Agent',
                    canTakeover: true,
                })));
            }
            if (data.metrics) {
                setMetrics(prev => ({
                    ...prev,
                    activeNow: data.metrics.active_calls || data.calls?.length || 0,
                }));
            }
        });

        // Auto-refresh every 15 seconds for agent dashboard
        const refreshInterval = setInterval(() => {
            fetchDashboardData();
        }, 15000);

        return () => {
            clearInterval(checkConnection);
            clearInterval(refreshInterval);
            unsubCalls();
            unsubMetrics();
            unsubLiveCalls();
        };
    }, [fetchDashboardData]);

    // Call duration timer
    useEffect(() => {
        let timer: ReturnType<typeof setInterval>;
        if (onCall) {
            timer = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [onCall]);

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
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const takeoverCall = useCallback((callId: string) => {
        console.log('Taking over call:', callId);
        setOnCall(true);
        setCallDuration(0);
    }, []);

    const endCall = useCallback(() => {
        setOnCall(false);
        setCallDuration(0);
        setIsMuted(false);
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'in-progress':
                return 'bg-green-500';
            case 'ringing':
                return 'bg-yellow-500 animate-pulse';
            case 'on-hold':
                return 'bg-orange-500';
            case 'completed':
                return 'text-emerald-400 bg-emerald-500/10';
            case 'pending':
                return 'text-yellow-400 bg-yellow-500/10';
            case 'escalated':
                return 'text-red-400 bg-red-500/10';
            default:
                return 'bg-gray-500';
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
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                                <Headphones className="w-5 h-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold text-white">CallSphere Demo</h1>
                                <p className="text-xs text-dark-400">Agent Console</p>
                            </div>
                        </div>

                        {/* Live Status */}
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <span className={clsx(
                                    'w-2 h-2 rounded-full',
                                    isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                                )} />
                                <span className="text-xs text-dark-400">
                                    {isConnected ? 'Live' : 'Disconnected'}
                                </span>
                            </div>

                            {/* Queue Alert */}
                            {metrics.queueLength > 0 && (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20">
                                    <PhoneIncoming className="w-4 h-4 text-yellow-400" />
                                    <span className="text-sm text-yellow-400 font-medium">
                                        {metrics.queueLength} in queue
                                    </span>
                                </div>
                            )}

                            {/* On Call Indicator */}
                            {onCall && (
                                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 animate-pulse">
                                    <Phone className="w-4 h-4 text-red-400" />
                                    <span className="text-sm text-red-400 font-medium">
                                        On Call - {formatDuration(callDuration)}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* User Menu */}
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                                    <User className="w-4 h-4 text-blue-400" />
                                </div>
                                <div className="text-right">
                                    <span className="text-sm text-white block">{user?.fullName || 'Agent'}</span>
                                    <span className="text-xs text-dark-400 capitalize">{role}</span>
                                </div>
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

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Loading State */}
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                        <span className="ml-3 text-white">Loading agent dashboard...</span>
                    </div>
                )}

                {/* Error State */}
                {error && !isLoading && (
                    <div className="glass rounded-2xl p-6 mb-6 border border-red-500/30">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-6 h-6 text-red-400" />
                            <div>
                                <h3 className="font-semibold text-white">Failed to load dashboard</h3>
                                <p className="text-sm text-dark-400">{error}</p>
                            </div>
                            <button
                                onClick={() => fetchDashboardData(true)}
                                className="ml-auto px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                            >
                                Retry
                            </button>
                        </div>
                    </div>
                )}

                {!isLoading && (
                    <>
                        {/* Refresh Bar */}
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-semibold text-white">Dashboard Overview</h2>
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white transition-colors text-sm disabled:opacity-50"
                            >
                                <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin')} />
                                {isRefreshing ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>

                        {/* Metrics Row */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Phone className="w-4 h-4 text-blue-400" />
                                    <span className="text-xs text-dark-400">Calls Today</span>
                                </div>
                                <span className="text-2xl font-bold text-white">{metrics.callsToday}</span>
                            </div>

                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Timer className="w-4 h-4 text-emerald-400" />
                                    <span className="text-xs text-dark-400">Avg Handle Time</span>
                                </div>
                                <span className="text-2xl font-bold text-white">{metrics.avgHandleTime}</span>
                            </div>

                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <CheckCircle className="w-4 h-4 text-green-400" />
                                    <span className="text-xs text-dark-400">Resolution Rate</span>
                                </div>
                                <span className="text-2xl font-bold text-white">{metrics.resolutionRate}%</span>
                            </div>

                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp className="w-4 h-4 text-yellow-400" />
                                    <span className="text-xs text-dark-400">Satisfaction</span>
                                </div>
                                <span className="text-2xl font-bold text-white">{metrics.satisfaction}/5</span>
                            </div>

                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Activity className="w-4 h-4 text-purple-400" />
                                    <span className="text-xs text-dark-400">Active Now</span>
                                </div>
                                <span className="text-2xl font-bold text-white">{metrics.activeNow}</span>
                            </div>

                            <div className="glass rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Users className="w-4 h-4 text-orange-400" />
                                    <span className="text-xs text-dark-400">In Queue</span>
                                </div>
                                <span className="text-2xl font-bold text-white">{metrics.queueLength}</span>
                            </div>
                        </div>

                        <div className="grid lg:grid-cols-3 gap-6">
                            {/* Live Calls Panel */}
                            <div className="lg:col-span-2 glass rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <Activity className="w-5 h-5 text-green-400" />
                                        Live Calls
                                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-500/10 text-green-400">
                                            {liveCalls.length} active
                                        </span>
                                    </h3>
                                </div>

                                <div className="space-y-3">
                                    {liveCalls.map((call) => (
                                        <div
                                            key={call.id}
                                            className={clsx(
                                                'p-4 rounded-xl border transition-all',
                                                call.status === 'ringing'
                                                    ? 'bg-yellow-500/5 border-yellow-500/30'
                                                    : 'bg-dark-800/50 border-dark-700 hover:border-dark-600'
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className={clsx(
                                                        'w-3 h-3 rounded-full',
                                                        getStatusColor(call.status)
                                                    )} />
                                                    <div>
                                                        <p className="text-white font-medium">{call.callerName}</p>
                                                        <p className="text-xs text-dark-400">{call.callerId}</p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <div className="text-right">
                                                        <div className="flex items-center gap-1 text-sm text-dark-300">
                                                            <Bot className="w-4 h-4" />
                                                            {call.agentType}
                                                        </div>
                                                        <p className="text-xs text-dark-400">
                                                            {call.status === 'ringing' ? 'Incoming' : formatDuration(call.duration)}
                                                        </p>
                                                    </div>

                                                    {call.canTakeover && voicePermissions.canEscalate && (
                                                        <button
                                                            onClick={() => takeoverCall(call.id)}
                                                            className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium flex items-center gap-2 transition-colors"
                                                        >
                                                            <ArrowUpRight className="w-4 h-4" />
                                                            Take Over
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {liveCalls.length === 0 && (
                                        <div className="text-center py-12 text-dark-400">
                                            <Phone className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                            <p>No active calls</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Voice Control Panel */}
                            <div className="glass rounded-2xl p-6">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                                    <Mic className="w-5 h-5 text-blue-400" />
                                    Voice Control
                                </h3>

                                {onCall ? (
                                    <div className="space-y-6">
                                        {/* Active Call Display */}
                                        <div className="text-center py-6 bg-dark-800/50 rounded-xl">
                                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center animate-pulse">
                                                <Phone className="w-10 h-10 text-green-400" />
                                            </div>
                                            <p className="text-2xl font-bold text-white mb-1">
                                                {formatDuration(callDuration)}
                                            </p>
                                            <p className="text-sm text-dark-400">Call in progress</p>
                                        </div>

                                        {/* Controls */}
                                        <div className="flex justify-center gap-4">
                                            <button
                                                onClick={() => setIsMuted(!isMuted)}
                                                className={clsx(
                                                    'w-14 h-14 rounded-full flex items-center justify-center transition-all',
                                                    isMuted
                                                        ? 'bg-red-500 text-white'
                                                        : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                                                )}
                                            >
                                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                            </button>

                                            <button
                                                onClick={endCall}
                                                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-colors"
                                            >
                                                <PhoneOff className="w-6 h-6" />
                                            </button>

                                            <button
                                                className="w-14 h-14 rounded-full bg-dark-700 text-dark-300 hover:bg-dark-600 flex items-center justify-center transition-colors"
                                            >
                                                <Volume2 className="w-6 h-6" />
                                            </button>
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <button className="p-3 rounded-lg bg-dark-800 hover:bg-dark-700 text-sm text-dark-300 transition-colors">
                                                Hold
                                            </button>
                                            <button className="p-3 rounded-lg bg-dark-800 hover:bg-dark-700 text-sm text-dark-300 transition-colors">
                                                Transfer
                                            </button>
                                            <button className="p-3 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-sm text-orange-400 transition-colors">
                                                Escalate
                                            </button>
                                            <button className="p-3 rounded-lg bg-dark-800 hover:bg-dark-700 text-sm text-dark-300 transition-colors">
                                                Add Note
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-blue-500/10 flex items-center justify-center">
                                            <Headphones className="w-12 h-12 text-blue-400" />
                                        </div>
                                        <p className="text-dark-300 mb-4">Ready to assist</p>
                                        <p className="text-xs text-dark-500 mb-6">
                                            Click "Take Over" on any live call or use the voice widget
                                        </p>
                                        <div className="flex items-center justify-center gap-2 text-xs text-dark-400">
                                            <Zap className="w-4 h-4 text-yellow-400" />
                                            Max {voicePermissions.maxCallDuration} min per call
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Recent Interactions */}
                        <div className="mt-6 glass rounded-2xl p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <MessageCircle className="w-5 h-5 text-purple-400" />
                                    Recent Interactions
                                </h3>
                            </div>
                            <div className="grid md:grid-cols-3 gap-4">
                                {recentInteractions.length === 0 ? (
                                    <div className="col-span-3 text-center py-8 text-dark-400">
                                        No recent interactions today
                                    </div>
                                ) : (
                                    recentInteractions.map((interaction) => (
                                        <div key={interaction.id} className="p-4 rounded-xl bg-dark-800/50 hover:bg-dark-800 transition-colors">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-white font-medium">{interaction.callerName}</span>
                                                <span className={clsx(
                                                    'text-xs px-2 py-0.5 rounded-full capitalize',
                                                    getStatusColor(interaction.status)
                                                )}>
                                                    {interaction.status}
                                                </span>
                                            </div>
                                            <p className="text-sm text-dark-300 mb-2">{interaction.summary}</p>
                                            <div className="flex items-center gap-2 text-xs text-dark-400">
                                                <span className="capitalize">{interaction.type}</span>
                                                <span>•</span>
                                                <span>{interaction.timestamp}</span>
                                            </div>
                                        </div>
                                    ))
                                )}
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
