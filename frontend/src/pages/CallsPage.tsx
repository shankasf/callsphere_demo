import { useState, useEffect, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner, EmptyState } from '../components/common';
import { HourlyCallsChart, AgentDistributionChart, CostTrendChart } from '../components/dashboard/Charts';
import { dashboardApi, callsApi } from '../services/api';
import { wsService } from '../services/websocket';
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, X, FileText, ChevronRight } from 'lucide-react';

// Completed-call transcripts are persisted as plain text, one line per turn in
// the form `[role]: content` (see ai-service session_manager.save_call_log).
// Parse those lines back into structured turns; multi-line content is folded
// into the preceding turn, and anything unparseable is shown as a system note.
type TranscriptTurn = { role: string; content: string };

function parseTranscript(raw?: string | null): TranscriptTurn[] {
    if (!raw) return [];
    const turns: TranscriptTurn[] = [];
    for (const line of raw.split('\n')) {
        const match = line.match(/^\s*\[([^\]]+)\]:\s?(.*)$/);
        if (match) {
            turns.push({ role: match[1].trim().toLowerCase(), content: match[2] });
        } else if (turns.length > 0) {
            turns[turns.length - 1].content += '\n' + line;
        } else if (line.trim()) {
            turns.push({ role: 'system', content: line });
        }
    }
    return turns.map((t) => ({ ...t, content: t.content.trim() }));
}

function turnLabel(role: string): { label: string; className: string } {
    if (role === 'user' || role === 'caller') return { label: 'Caller', className: 'text-primary-200' };
    if (role === 'assistant' || role === 'ai') return { label: 'AI', className: 'text-dark-200' };
    return { label: role.charAt(0).toUpperCase() + role.slice(1), className: 'text-dark-400' };
}

export function CallsPage() {
    const queryClient = useQueryClient();
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
    const [expandedLive, setExpandedLive] = useState<string | null>(null);
    // Completed call selected for the right-side transcript panel.
    const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

    const { data: selectedCall, isLoading: detailLoading } = useQuery({
        queryKey: ['call-detail', selectedCallId],
        queryFn: () => callsApi.getById(selectedCallId as string),
        enabled: !!selectedCallId,
    });

    const { data: calls, isLoading, refetch } = useQuery({
        queryKey: ['dashboard-calls'],
        queryFn: () => dashboardApi.getCalls(),
    });

    // Live (in-progress) calls — caller phone numbers come from Twilio's `From`
    // (captured by the AI service webhook) via /api/live-sessions.
    const { data: live } = useQuery({
        queryKey: ['dashboard-live-calls'],
        queryFn: () => dashboardApi.getLiveCalls(),
        refetchInterval: 5000,
    });
    const liveCalls = live?.calls || [];

    // WebSocket subscription for real-time updates
    useEffect(() => {
        wsService.connect();

        const refreshCalls = () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard-calls'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-live-calls'] });
            setLastUpdate(new Date());
        };

        const handleDashboardUpdate = (data: unknown) => {
            const update = data as { type: string; action: string };
            if (update.type === 'call') {
                refreshCalls();
            }
        };

        const handleCallUpdate = () => refreshCalls();
        const handleCallEnd = () => refreshCalls();

        wsService.on('dashboard:update', handleDashboardUpdate);
        wsService.on('call:update', handleCallUpdate);
        wsService.on('call:end', handleCallEnd);

        return () => {
            wsService.off('dashboard:update', handleDashboardUpdate);
            wsService.off('call:update', handleCallUpdate);
            wsService.off('call:end', handleCallEnd);
        };
    }, [queryClient]);

    const metrics = calls?.metrics;
    const callLogs = calls?.calls || [];

    if (isLoading) {
        return (
            <DashboardLayout title="Call Analytics" subtitle="Monitor call performance and agent distribution">
                <LoadingSpinner size="lg" />
            </DashboardLayout>
        );
    }

    const getStatusIcon = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'completed':
                return <CheckCircle className="w-4 h-4 text-green-400" />;
            case 'failed':
            case 'error':
                return <XCircle className="w-4 h-4 text-red-400" />;
            case 'in_progress':
                return <Clock className="w-4 h-4 text-yellow-400" />;
            default:
                return <AlertCircle className="w-4 h-4 text-dark-400" />;
        }
    };

    const getStatusClass = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'completed':
                return 'bg-green-600/20 text-green-400';
            case 'failed':
            case 'error':
                return 'bg-red-600/20 text-red-400';
            case 'in_progress':
                return 'bg-yellow-600/20 text-yellow-400';
            default:
                return 'bg-dark-600/20 text-dark-400';
        }
    };

    const formatDuration = (seconds: number) => {
        if (!seconds) return '0s';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        if (mins === 0) return `${secs}s`;
        return `${mins}m ${secs}s`;
    };

    // Caller phone number as captured from Twilio's `From`. Browser/WebRTC
    // sessions have no PSTN number, so we label them instead.
    const formatCaller = (from?: string) => {
        if (!from) return 'Unknown';
        if (from.startsWith('webrtc:')) {
            const id = from.slice('webrtc:'.length);
            return id && id !== 'anonymous' ? id : 'Browser';
        }
        if (from.startsWith('client:')) return from.slice('client:'.length) || 'Browser';
        return from;
    };

    return (
        <DashboardLayout
            title="Call Analytics"
            subtitle="Monitor call performance and agent distribution"
            onRefresh={() => refetch()}
            headerContent={
                <span className="text-sm text-dark-400 flex items-center gap-2">
                    <RefreshCw className="w-3 h-3" />
                    Updated: {lastUpdate.toLocaleTimeString()}
                </span>
            }
        >
            <div className="fade-in space-y-6">
                {/* Top Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <MetricCard
                        label="Total Calls"
                        value={metrics?.total_calls || 0}
                        icon="phone"
                        color="primary"
                    />
                    <MetricCard
                        label="Completed"
                        value={metrics?.completed || 0}
                        icon="check"
                        color="green"
                    />
                    <MetricCard
                        label="In Progress"
                        value={metrics?.in_progress || 0}
                        icon="activity"
                        color="yellow"
                    />
                    <MetricCard
                        label="Failed"
                        value={metrics?.failed || 0}
                        icon="x"
                        color="red"
                    />
                    <MetricCard
                        label="Avg Duration"
                        value={formatDuration(Math.round(metrics?.avg_duration_seconds || 0))}
                        icon="clock"
                        color="blue"
                    />
                    <MetricCard
                        label="AI Resolution"
                        value={`${metrics?.ai_resolution_rate || 0}%`}
                        icon="zap"
                        color="purple"
                    />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <HourlyCallsChart
                        title="Hourly Call Volume"
                        data={metrics?.hourly_calls || []}
                    />
                    <AgentDistributionChart
                        title="Agent Distribution"
                        data={metrics?.by_agent || []}
                    />
                </div>

                {/* Cost Trend */}
                <CostTrendChart
                    title="Daily Cost Trend"
                    data={metrics?.daily_costs || []}
                />

                {/* Live Calls — real-time, caller phone numbers captured from Twilio */}
                <Card
                    title="Live Calls"
                    headerContent={
                        <span className="flex items-center gap-2 text-sm">
                            <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                            </span>
                            <span className="text-dark-400">{liveCalls.length} in progress</span>
                        </span>
                    }
                >
                    {liveCalls.length === 0 ? (
                        <EmptyState
                            message="No active calls right now. Incoming calls appear here in real-time with the caller's phone number."
                            icon={<Phone className="w-12 h-12 text-dark-400" />}
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-dark-400 text-sm border-b border-dark-800">
                                        <th className="pb-3">Phone Number</th>
                                        <th className="pb-3">Caller</th>
                                        <th className="pb-3">Direction</th>
                                        <th className="pb-3">Agent</th>
                                        <th className="pb-3">Duration</th>
                                        <th className="pb-3">Transcript</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {liveCalls.map((call: any) => {
                                        const id = call.callSid || call.sessionId;
                                        const transcript = call.transcript || [];
                                        const isOpen = expandedLive === id;
                                        return (
                                            <Fragment key={id}>
                                                <tr
                                                    className="border-b border-dark-800 hover:bg-dark-800/50 cursor-pointer"
                                                    onClick={() => setExpandedLive(isOpen ? null : id)}
                                                >
                                                    <td className="py-3 pr-4 font-mono text-dark-100">
                                                        {formatCaller(call.from || call.from_number)}
                                                    </td>
                                                    <td className="py-3 pr-4 text-dark-300">
                                                        {call.callerName || call.caller_name || '—'}
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <span className="inline-flex items-center gap-1 text-dark-300 capitalize">
                                                            {(call.direction || 'inbound') === 'outbound'
                                                                ? <PhoneOutgoing className="w-4 h-4 text-green-400" />
                                                                : <PhoneIncoming className="w-4 h-4 text-primary-400" />}
                                                            {call.direction || 'inbound'}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 pr-4">
                                                        <span className="px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400 capitalize">
                                                            {(call.currentAgent || call.agentType || 'triage').replace('_agent', '')}
                                                        </span>
                                                    </td>
                                                    <td className="py-3 pr-4 text-dark-300">{formatDuration(call.duration || 0)}</td>
                                                    <td className="py-3 text-primary-400">
                                                        {transcript.length} msg{transcript.length === 1 ? '' : 's'} {isOpen ? '▲' : '▼'}
                                                    </td>
                                                </tr>
                                                {isOpen && (
                                                    <tr className="border-b border-dark-800 bg-dark-900/40">
                                                        <td colSpan={6} className="p-4">
                                                            {transcript.length === 0 ? (
                                                                <p className="text-dark-400 text-sm">Waiting for conversation… (live transcript appears as the caller and AI speak)</p>
                                                            ) : (
                                                                <div className="space-y-2 max-h-72 overflow-y-auto">
                                                                    {transcript.map((t: any, i: number) => (
                                                                        <div key={i} className={`text-sm ${t.role === 'user' ? 'text-primary-200' : 'text-dark-200'}`}>
                                                                            <span className="font-semibold capitalize">{t.role === 'user' ? 'Caller' : 'AI'}:</span> {t.content}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Call Logs Table */}
                <Card title="Recent Calls">
                    {callLogs.length === 0 ? (
                        <EmptyState
                            message="No call logs found"
                            icon={<Phone className="w-12 h-12 text-dark-400" />}
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="text-left text-dark-400 text-sm border-b border-dark-800">
                                        <th className="pb-3">Call ID</th>
                                        <th className="pb-3">Phone</th>
                                        <th className="pb-3">Agent</th>
                                        <th className="pb-3">Status</th>
                                        <th className="pb-3">Duration</th>
                                        <th className="pb-3">Time</th>
                                        <th className="pb-3 text-right">Transcript</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {callLogs.slice(0, 15).map((call) => {
                                        const callKey = (call.call_id || call.id) as string;
                                        const isSelected = selectedCallId === callKey;
                                        return (
                                            <tr
                                                key={call.id}
                                                role="button"
                                                tabIndex={0}
                                                aria-pressed={isSelected}
                                                onClick={() => setSelectedCallId(callKey)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelectedCallId(callKey);
                                                    }
                                                }}
                                                className={`border-b border-dark-800 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary-500/60 ${
                                                    isSelected ? 'bg-primary-600/10' : 'hover:bg-dark-800/50'
                                                }`}
                                            >
                                                <td className="py-3 pr-4 font-mono text-xs text-dark-300">
                                                    {call.call_sid?.substring(0, 12) || call.id}...
                                                </td>
                                                <td className="py-3 pr-4">{call.caller_phone || 'Unknown'}</td>
                                                <td className="py-3 pr-4">
                                                    <span className="px-2 py-1 rounded text-xs bg-blue-600/20 text-blue-400">
                                                        {call.last_agent || 'None'}
                                                    </span>
                                                </td>
                                                <td className="py-3 pr-4">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${getStatusClass(call.status)}`}>
                                                        {getStatusIcon(call.status)}
                                                        {call.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 pr-4 text-dark-300">
                                                    {formatDuration(call.duration_seconds || 0)}
                                                </td>
                                                <td className="py-3 pr-4 text-dark-400">
                                                    {call.created_at ? new Date(call.created_at).toLocaleString() : '-'}
                                                </td>
                                                <td className="py-3 text-right">
                                                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${isSelected ? 'text-primary-300' : 'text-primary-400'}`}>
                                                        <FileText className="w-3.5 h-3.5" />
                                                        View
                                                        <ChevronRight className="w-3.5 h-3.5" />
                                                    </span>
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

            {/* Right-side transcript panel for a completed call */}
            {selectedCallId && (
                <>
                    <div
                        className="fixed inset-0 bg-black/50 z-40"
                        onClick={() => setSelectedCallId(null)}
                        aria-hidden="true"
                    />
                    <aside
                        role="dialog"
                        aria-label="Call transcript"
                        className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-dark-900 border-l border-dark-800 shadow-2xl flex flex-col slide-in-right"
                    >
                        <div className="flex items-start justify-between gap-3 p-4 border-b border-dark-800">
                            <div className="min-w-0">
                                <h3 className="text-dark-100 font-semibold flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-primary-400" />
                                    Call Transcript
                                </h3>
                                <p className="text-xs text-dark-400 mt-1 font-mono truncate">
                                    {selectedCall?.call_sid || selectedCallId}
                                </p>
                            </div>
                            <button
                                onClick={() => setSelectedCallId(null)}
                                className="p-1.5 rounded hover:bg-dark-800 text-dark-400 hover:text-dark-100 transition-colors"
                                aria-label="Close transcript"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Call meta */}
                        {selectedCall && (
                            <div className="px-4 py-3 border-b border-dark-800 grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                                <div>
                                    <span className="text-dark-500 text-xs block">Caller</span>
                                    <span className="text-dark-200">{selectedCall.caller_name || selectedCall.caller_phone || 'Unknown'}</span>
                                </div>
                                <div>
                                    <span className="text-dark-500 text-xs block">Agent</span>
                                    <span className="text-dark-200 capitalize">{(selectedCall.agent_type || selectedCall.last_agent || 'None').replace('_agent', '')}</span>
                                </div>
                                <div>
                                    <span className="text-dark-500 text-xs block">Duration</span>
                                    <span className="text-dark-200">{formatDuration(selectedCall.duration_seconds || 0)}</span>
                                </div>
                                <div>
                                    <span className="text-dark-500 text-xs block">Status</span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${getStatusClass(selectedCall.status)}`}>
                                        {getStatusIcon(selectedCall.status)}
                                        {selectedCall.status}
                                    </span>
                                </div>
                                {selectedCall.call_summary && (
                                    <div className="col-span-2">
                                        <span className="text-dark-500 text-xs block">Summary</span>
                                        <span className="text-dark-300">{selectedCall.call_summary}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Transcript body */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {detailLoading ? (
                                <LoadingSpinner size="md" />
                            ) : (() => {
                                const turns = parseTranscript(selectedCall?.transcript);
                                if (turns.length === 0) {
                                    return (
                                        <EmptyState
                                            message="No transcript was recorded for this call."
                                            icon={<FileText className="w-12 h-12 text-dark-400" />}
                                        />
                                    );
                                }
                                return (
                                    <div className="space-y-3">
                                        {turns.map((t, i) => {
                                            const { label, className } = turnLabel(t.role);
                                            return (
                                                <div key={i} className="text-sm">
                                                    <span className="font-semibold text-xs uppercase tracking-wide text-dark-500">{label}</span>
                                                    <p className={`mt-0.5 whitespace-pre-wrap ${className}`}>{t.content}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}
                        </div>
                    </aside>
                </>
            )}
        </DashboardLayout>
    );
}
