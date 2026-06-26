import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, EmptyState, LoadingSpinner } from '../components/common';
import {
    Phone,
    PhoneIncoming,
    PhoneOutgoing,
    User,
    Bot,
    ChevronRight,
    Timer,
    X,
    CheckCircle,
    Cpu,
    Wrench,
    Users,
    Clock,
    AlertTriangle,
    ArrowRightLeft,
    RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { wsService } from '../services/websocket';
import { dashboardApi } from '../services/api';

// Types for live call data
interface LiveCallEvent {
    callSid: string;
    sessionId: string;
    status: 'ringing' | 'in-progress' | 'completed' | 'failed';
    from: string;
    to?: string;
    direction: 'inbound' | 'outbound';
    startedAt: string;
    callerName?: string;
    companyName?: string;
    agentType?: string;
    duration?: number;
    transcript?: TranscriptEntry[];
    agentHistory?: AgentEvent[];
    toolCalls?: ToolCall[];
    sentiment?: 'positive' | 'neutral' | 'negative';
    aiResolution?: boolean;
    waitTime?: number;
    queuePosition?: number;
}

interface TranscriptEntry {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
}

interface AgentEvent {
    agentName: string;
    action: string;
    timestamp: string;
    status?: 'success' | 'failed' | 'pending';
}

interface ToolCall {
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
    timestamp: string;
    status: 'success' | 'failed' | 'pending';
}

interface QueueMetrics {
    callsInQueue: number;
    avgWaitTime: number;
    longestWait: number;
    abandonRate: number;
    serviceLevelPct: number;
    agentsAvailable: number;
    agentsBusy: number;
    callsAnsweredToday: number;
    callsAbandonedToday: number;
    peakHourVolume: number;
}

interface HandoffMetrics {
    totalHandoffs: number;
    handoffRate: number;
    avgHandoffTime: number;
    successfulHandoffs: number;
    failedHandoffs: number;
    handoffReasons: { reason: string; count: number; percentage: number }[];
}

// Empty/default metrics
const emptyQueueMetrics: QueueMetrics = {
    callsInQueue: 0,
    avgWaitTime: 0,
    longestWait: 0,
    abandonRate: 0,
    serviceLevelPct: 0,
    agentsAvailable: 0,
    agentsBusy: 0,
    callsAnsweredToday: 0,
    callsAbandonedToday: 0,
    peakHourVolume: 0,
};

const emptyHandoffMetrics: HandoffMetrics = {
    totalHandoffs: 0,
    handoffRate: 0,
    avgHandoffTime: 0,
    successfulHandoffs: 0,
    failedHandoffs: 0,
    handoffReasons: [],
};

// Live indicator component
function LiveIndicator() {
    return (
        <span className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="text-green-400 text-sm font-medium">Live</span>
        </span>
    );
}

// Call timer component.
// The server already computes an authoritative `duration` (seconds) for each
// live session and refreshes it every poll. We use that as the baseline and
// tick locally 1s at a time between polls — this avoids clock skew and the
// timezone pitfalls of parsing a server ISO timestamp on the client. When no
// server duration is available we fall back to computing from `startedAt`.
function CallTimer({ startedAt, durationSeconds }: { startedAt?: string; durationSeconds?: number }) {
    const [elapsed, setElapsed] = useState(durationSeconds ?? 0);

    useEffect(() => {
        let base = durationSeconds;
        if (base == null && startedAt) {
            const start = new Date(startedAt).getTime();
            base = Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 1000)) : 0;
        }
        base = base ?? 0;
        setElapsed(base);
        const tickStart = Date.now();
        const interval = setInterval(() => {
            setElapsed(base + Math.floor((Date.now() - tickStart) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, [startedAt, durationSeconds]);

    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    return (
        <span className="font-mono text-lg text-primary-400">
            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
        </span>
    );
}

// Queue Status Card
function QueueStatusCard({ metrics }: { metrics: QueueMetrics }) {
    return (
        <Card title="Queue Status" className="h-full">
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-dark-800 rounded-xl p-4 text-center">
                        <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-blue-400">{metrics.callsInQueue}</p>
                        <p className="text-xs text-dark-400">In Queue</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl p-4 text-center">
                        <Clock className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                        <p className="text-2xl font-bold text-yellow-400">{metrics.avgWaitTime}s</p>
                        <p className="text-xs text-dark-400">Avg Wait</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-dark-400">Service Level</span>
                        <span className="text-green-400">{metrics.serviceLevelPct.toFixed(1)}%</span>
                    </div>
                    <div className="bg-dark-700 rounded-full h-2">
                        <div
                            className="bg-green-500 h-2 rounded-full transition-all duration-500"
                            style={{ width: metrics.serviceLevelPct + '%' }}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-dark-800 rounded-lg p-2">
                        <p className="text-sm font-semibold text-green-400">{metrics.agentsAvailable}</p>
                        <p className="text-xs text-dark-400">Available</p>
                    </div>
                    <div className="bg-dark-800 rounded-lg p-2">
                        <p className="text-sm font-semibold text-primary-400">{metrics.agentsBusy}</p>
                        <p className="text-xs text-dark-400">Busy</p>
                    </div>
                </div>
            </div>
        </Card>
    );
}

// Handoff Metrics Card
function HandoffMetricsCard({ metrics }: { metrics: HandoffMetrics }) {
    return (
        <Card title="AI ↔ Human Handoffs" className="h-full">
            <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-dark-800 rounded-xl p-3">
                        <ArrowRightLeft className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                        <p className="text-xl font-bold">{metrics.totalHandoffs}</p>
                        <p className="text-xs text-dark-400">Total</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl p-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-green-400">{metrics.successfulHandoffs}</p>
                        <p className="text-xs text-dark-400">Success</p>
                    </div>
                    <div className="bg-dark-800 rounded-xl p-3">
                        <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                        <p className="text-xl font-bold text-red-400">{metrics.failedHandoffs}</p>
                        <p className="text-xs text-dark-400">Failed</p>
                    </div>
                </div>
                <div>
                    <p className="text-xs text-dark-400 mb-2">Handoff Reasons</p>
                    <div className="space-y-2">
                        {metrics.handoffReasons.slice(0, 3).map((reason, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="flex-1 bg-dark-700 rounded-full h-2">
                                    <div
                                        className="bg-purple-500 h-2 rounded-full"
                                        style={{ width: reason.percentage + '%' }}
                                    />
                                </div>
                                <span className="text-xs text-dark-300 w-24 truncate">{reason.reason}</span>
                                <span className="text-xs text-dark-400 w-8 text-right">{reason.percentage}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Card>
    );
}

// Live Call Card
function LiveCallCard({ call, onClick, isSelected }: { call: LiveCallEvent; onClick: () => void; isSelected: boolean }) {
    const sentimentColors = {
        positive: 'text-green-400',
        neutral: 'text-blue-400',
        negative: 'text-red-400',
    };

    return (
        <div
            onClick={onClick}
            className={clsx(
                'bg-dark-800/50 backdrop-blur-sm border rounded-xl p-4 cursor-pointer transition-all hover:bg-dark-700/50',
                isSelected ? 'border-primary-500 ring-2 ring-primary-500/30' : 'border-dark-700'
            )}
        >
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center">
                        {call.direction === 'inbound' ? (
                            <PhoneIncoming className="w-5 h-5 text-primary-400" />
                        ) : (
                            <PhoneOutgoing className="w-5 h-5 text-green-400" />
                        )}
                    </div>
                    <div>
                        <p className="font-medium text-dark-100">{call.callerName || call.from}</p>
                        <p className="text-sm text-dark-400">{call.companyName || 'Unknown Company'}</p>
                    </div>
                </div>
                <LiveIndicator />
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1">
                        <Timer className="w-4 h-4 text-dark-400" />
                        <CallTimer startedAt={call.startedAt} durationSeconds={call.duration} />
                    </div>
                    <div className="flex items-center gap-1">
                        <Bot className="w-4 h-4 text-dark-400" />
                        <span className="text-sm text-dark-300 capitalize">
                            {call.agentType?.replace('_agent', '') || 'Triage'}
                        </span>
                    </div>
                </div>
                <span className={clsx('text-sm capitalize', sentimentColors[call.sentiment || 'neutral'])}>
                    {call.sentiment || 'neutral'}
                </span>
            </div>

            {/* Real-time transcript preview (last 2 lines) */}
            <div className="mt-3 pt-3 border-t border-dark-700">
                {call.transcript && call.transcript.length > 0 ? (
                    <div className="space-y-1">
                        {call.transcript.slice(-2).map((t, i) => (
                            <p key={i} className="text-xs truncate">
                                <span className={clsx('font-semibold', t.role === 'user' ? 'text-primary-300' : 'text-purple-300')}>
                                    {t.role === 'user' ? 'Caller' : 'AI'}:
                                </span>{' '}
                                <span className="text-dark-300">{t.content}</span>
                            </p>
                        ))}
                    </div>
                ) : (
                    <p className="text-xs text-dark-500 italic">Listening… transcript will appear live</p>
                )}
                <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-dark-400">
                        {call.transcript?.length || 0} messages • {call.toolCalls?.length || 0} tool calls
                    </span>
                    <span className="text-xs text-primary-400 flex items-center gap-1">
                        Full transcript <ChevronRight className="w-3 h-3" />
                    </span>
                </div>
            </div>
        </div>
    );
}

// Live Transcript Component
function LiveTranscript({ transcript }: { transcript: TranscriptEntry[] }) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [transcript]);

    if (!transcript || transcript.length === 0) {
        return (
            <div className="flex items-center justify-center h-32 text-dark-400">
                <p>Waiting for conversation...</p>
            </div>
        );
    }

    return (
        <div
            ref={scrollRef}
            className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2"
        >
            {transcript.map((entry, i) => (
                <div
                    key={i}
                    className={clsx(
                        'flex gap-3',
                        entry.role === 'user' ? 'flex-row-reverse' : ''
                    )}
                >
                    <div className={clsx(
                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                        entry.role === 'user' ? 'bg-primary-600/20' : 'bg-purple-600/20'
                    )}>
                        {entry.role === 'user' ? (
                            <User className="w-4 h-4 text-primary-400" />
                        ) : (
                            <Bot className="w-4 h-4 text-purple-400" />
                        )}
                    </div>
                    <div className={clsx(
                        'max-w-[80%] p-3 rounded-xl text-sm break-words',
                        entry.role === 'user'
                            ? 'bg-primary-600/20 text-primary-100'
                            : 'bg-dark-700 text-dark-200'
                    )}>
                        {entry.content}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Agent Timeline Component
function AgentTimeline({ events }: { events: AgentEvent[] }) {
    if (!events || events.length === 0) {
        return (
            <div className="flex items-center justify-center h-32 text-dark-400">
                <p>No agent activity yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {events.map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                    <div className="relative">
                        <div className={clsx(
                            'w-8 h-8 rounded-full flex items-center justify-center',
                            event.status === 'success' ? 'bg-green-600/20' :
                                event.status === 'failed' ? 'bg-red-600/20' : 'bg-blue-600/20'
                        )}>
                            <Cpu className="w-4 h-4 text-blue-400" />
                        </div>
                        {i < events.length - 1 && (
                            <div className="absolute left-1/2 top-8 w-0.5 h-6 bg-dark-600 -translate-x-1/2" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-dark-200 capitalize">
                            {event.agentName.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-dark-400">{event.action}</p>
                    </div>
                    <span className="text-xs text-dark-500">
                        {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                </div>
            ))}
        </div>
    );
}

// Tool Calls List Component
function ToolCallsList({ calls }: { calls: ToolCall[] }) {
    if (!calls || calls.length === 0) {
        return (
            <div className="flex items-center justify-center h-32 text-dark-400">
                <p>No tool calls yet</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {calls.map((call, i) => (
                <div key={i} className="bg-dark-800 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-medium text-dark-200">{call.name}</span>
                        </div>
                        <span className={clsx(
                            'text-xs px-2 py-0.5 rounded-full',
                            call.status === 'success' ? 'bg-green-600/20 text-green-400' :
                                call.status === 'failed' ? 'bg-red-600/20 text-red-400' : 'bg-yellow-600/20 text-yellow-400'
                        )}>
                            {call.status}
                        </span>
                    </div>
                    <code className="text-xs text-dark-400 block">
                        {JSON.stringify(call.args, null, 2)}
                    </code>
                </div>
            ))}
        </div>
    );
}

// Call Detail Panel
function CallDetailPanel({ call, onClose }: { call: LiveCallEvent; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<'transcript' | 'agents' | 'tools'>('transcript');

    return (
        <div className="fixed inset-0 z-50 flex overflow-hidden">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] md:w-[550px] bg-dark-900 border-l border-dark-700 shadow-2xl flex flex-col overflow-hidden z-50">
                {/* Header */}
                <div className="p-4 border-b border-dark-700 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center">
                            <Phone className="w-5 h-5 text-primary-400" />
                        </div>
                        <div>
                            <p className="font-medium">{call.callerName || call.from}</p>
                            <p className="text-sm text-dark-400">{call.companyName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-dark-800 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Live Stats */}
                <div className="p-4 border-b border-dark-700 grid grid-cols-3 gap-4">
                    <div className="text-center">
                        <p className="text-sm text-dark-400">Duration</p>
                        <CallTimer startedAt={call.startedAt} durationSeconds={call.duration} />
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-dark-400">Agent</p>
                        <p className="font-medium text-purple-400 capitalize">
                            {call.agentType?.replace('_agent', '')}
                        </p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-dark-400">Sentiment</p>
                        <p className={clsx(
                            'font-medium capitalize',
                            call.sentiment === 'positive' ? 'text-green-400' :
                                call.sentiment === 'negative' ? 'text-red-400' : 'text-blue-400'
                        )}>
                            {call.sentiment || 'Neutral'}
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-dark-700">
                    {(['transcript', 'agents', 'tools'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={clsx(
                                'flex-1 py-3 text-sm font-medium transition-colors',
                                activeTab === tab
                                    ? 'text-primary-400 border-b-2 border-primary-400'
                                    : 'text-dark-400 hover:text-dark-200'
                            )}
                        >
                            {tab === 'transcript' && 'Transcript'}
                            {tab === 'agents' && 'Agent Activity'}
                            {tab === 'tools' && 'Tool Calls'}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {activeTab === 'transcript' && (
                        <LiveTranscript transcript={call.transcript || []} />
                    )}
                    {activeTab === 'agents' && (
                        <AgentTimeline events={call.agentHistory || []} />
                    )}
                    {activeTab === 'tools' && (
                        <ToolCallsList calls={call.toolCalls || []} />
                    )}
                </div>
            </div>
        </div>
    );
}

// Main Page Component
export function LiveCallsPage() {
    const [liveCalls, setLiveCalls] = useState<LiveCallEvent[]>([]);
    const [selectedCall, setSelectedCall] = useState<LiveCallEvent | null>(null);
    const [queueMetrics, setQueueMetrics] = useState<QueueMetrics>(emptyQueueMetrics);
    const [handoffMetrics, setHandoffMetrics] = useState<HandoffMetrics>(emptyHandoffMetrics);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    // Fetch live data from API
    const fetchLiveData = useCallback(async () => {
        try {
            const response = await dashboardApi.getLiveCalls();
            if (response) {
                // Map API response to our types
                const calls: LiveCallEvent[] = (response.calls || []).map((call: any) => ({
                    callSid: call.callSid || call.call_sid,
                    sessionId: call.sessionId || call.session_id,
                    status: call.status || 'in-progress',
                    from: call.from || call.from_number,
                    to: call.to || call.to_number,
                    direction: call.direction || 'inbound',
                    startedAt: call.startedAt || call.started_at || call.startTime || new Date().toISOString(),
                    callerName: call.callerName || call.caller_name,
                    companyName: call.companyName || call.company_name,
                    agentType: call.agentType || call.agent_type || call.currentAgent,
                    duration: call.duration,
                    transcript: call.transcript || [],
                    agentHistory: call.agentHistory || [],
                    toolCalls: call.toolCalls || [],
                    sentiment: call.sentiment,
                    aiResolution: call.aiResolution,
                    waitTime: call.waitTime,
                    queuePosition: call.queuePosition,
                }));
                setLiveCalls(calls);

                // Map queue metrics
                if (response.metrics?.queue) {
                    setQueueMetrics({
                        callsInQueue: response.metrics.queue.callsInQueue || 0,
                        avgWaitTime: response.metrics.queue.avgWaitTime || 0,
                        longestWait: response.metrics.queue.longestWait || 0,
                        abandonRate: response.metrics.queue.abandonRate || 0,
                        serviceLevelPct: response.metrics.queue.serviceLevelPct || 0,
                        agentsAvailable: response.metrics.queue.agentsAvailable || 0,
                        agentsBusy: response.metrics.queue.agentsBusy || response.metrics.activeCalls || 0,
                        callsAnsweredToday: response.metrics.queue.callsAnsweredToday || 0,
                        callsAbandonedToday: response.metrics.queue.callsAbandonedToday || 0,
                        peakHourVolume: response.metrics.queue.peakHourVolume || 0,
                    });
                } else if (response.metrics) {
                    // Fallback to basic metrics
                    setQueueMetrics(prev => ({
                        ...prev,
                        agentsBusy: response.metrics.activeCalls || 0,
                    }));
                }

                // Map handoff metrics
                if (response.metrics?.handoff) {
                    setHandoffMetrics({
                        totalHandoffs: response.metrics.handoff.totalHandoffs || 0,
                        handoffRate: response.metrics.handoff.handoffRate || 0,
                        avgHandoffTime: response.metrics.handoff.avgHandoffTime || 0,
                        successfulHandoffs: response.metrics.handoff.successfulHandoffs || 0,
                        failedHandoffs: response.metrics.handoff.failedHandoffs || 0,
                        handoffReasons: response.metrics.handoff.handoffReasons || [],
                    });
                }

                setLastRefresh(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch live calls:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch + 2s polling so the live transcript streams in real-time
    // (WebSocket events also push updates, but polling guarantees freshness
    // even if a socket event is missed).
    useEffect(() => {
        wsService.connect();
        fetchLiveData();
        const interval = setInterval(fetchLiveData, 2000);
        return () => clearInterval(interval);
    }, [fetchLiveData]);

    // Keep selectedCall in sync with liveCalls updates
    useEffect(() => {
        if (selectedCall) {
            const updatedCall = liveCalls.find(c => c.callSid === selectedCall.callSid);
            if (updatedCall && JSON.stringify(updatedCall) !== JSON.stringify(selectedCall)) {
                setSelectedCall(updatedCall);
            } else if (!updatedCall) {
                // Call ended
                setSelectedCall(null);
            }
        }
    }, [liveCalls, selectedCall]);

    // WebSocket connection for real-time updates
    useEffect(() => {
        // Handle full live calls update (most common)
        const handleLiveCallsUpdate = (data: unknown) => {
            const update = data as { calls: any[]; metrics: any };
            if (update.calls) {
                const calls: LiveCallEvent[] = update.calls.map((call: any) => ({
                    callSid: call.callSid || call.call_sid,
                    sessionId: call.sessionId || call.session_id,
                    status: call.status || 'in-progress',
                    from: call.from || call.from_number,
                    to: call.to || call.to_number,
                    direction: call.direction || 'inbound',
                    startedAt: call.startedAt || call.started_at || call.startTime || new Date().toISOString(),
                    callerName: call.callerName || call.caller_name,
                    companyName: call.companyName || call.company_name,
                    agentType: call.agentType || call.agent_type || call.currentAgent,
                    duration: call.duration,
                    transcript: call.transcript || [],
                    agentHistory: call.agentHistory || [],
                    toolCalls: call.toolCalls || [],
                    sentiment: call.sentiment,
                    aiResolution: call.aiResolution,
                    waitTime: call.waitTime,
                    queuePosition: call.queuePosition,
                }));
                setLiveCalls(calls);
                setLastRefresh(new Date());

                // Update queue metrics if provided
                if (update.metrics) {
                    setQueueMetrics(prev => ({
                        ...prev,
                        agentsBusy: update.metrics.activeCalls || 0,
                    }));
                }
            }
            // Debug: Log every livecalls:update event
            console.log("[LiveCallsPage] Received livecalls:update", update);
        };

        const handleCallUpdate = (data: unknown) => {
            const callData = data as LiveCallEvent;
            setLiveCalls(prev => {
                const existing = prev.findIndex(c => c.callSid === callData.callSid);
                if (existing >= 0) {
                    const updated = [...prev];
                    updated[existing] = callData;
                    return updated;
                }
                return [...prev, callData];
            });
            setLastRefresh(new Date());
        };

        const handleCallEnd = (data: unknown) => {
            const endData = data as { callSid: string };
            setLiveCalls(prev => prev.filter(c => c.callSid !== endData.callSid));
            if (selectedCall?.callSid === endData.callSid) {
                setSelectedCall(null);
            }
            setLastRefresh(new Date());
        };

        wsService.on('livecalls:update', handleLiveCallsUpdate);
        wsService.on('call:update', handleCallUpdate);
        wsService.on('call:end', handleCallEnd);

        return () => {
            wsService.off('livecalls:update', handleLiveCallsUpdate);
            wsService.off('call:update', handleCallUpdate);
            wsService.off('call:end', handleCallEnd);
        };
    }, [selectedCall]);

    const totalActiveCalls = liveCalls.length;

    if (isLoading) {
        return (
            <DashboardLayout
                title="Live Call Center"
                subtitle="Real-time monitoring of all active calls"
                headerContent={<LiveIndicator />}
            >
                <div className="flex items-center justify-center h-96">
                    <LoadingSpinner size="lg" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            title="Live Call Center"
            subtitle="Real-time monitoring of all active calls"
            headerContent={
                <div className="flex items-center gap-4">
                    <button
                        onClick={fetchLiveData}
                        className="flex items-center gap-2 text-sm text-dark-400 hover:text-dark-200 transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh</span>
                    </button>
                    <span className="text-xs text-dark-500">
                        Last updated: {lastRefresh.toLocaleTimeString()}
                    </span>
                    <LiveIndicator />
                </div>
            }
        >
            <div className="fade-in space-y-6">
                {/* Top Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <MetricCard
                        label="Active Calls"
                        value={totalActiveCalls.toString()}
                        icon="phone"
                        color="green"
                    />
                    <MetricCard
                        label="In Queue"
                        value={queueMetrics.callsInQueue.toString()}
                        icon="users"
                        color="blue"
                    />
                    <MetricCard
                        label="Avg Wait"
                        value={queueMetrics.avgWaitTime + 's'}
                        icon="clock"
                        color="yellow"
                    />
                    <MetricCard
                        label="Agents Available"
                        value={queueMetrics.agentsAvailable.toString()}
                        icon="check"
                        color="green"
                    />
                    <MetricCard
                        label="Service Level"
                        value={queueMetrics.serviceLevelPct.toFixed(0) + '%'}
                        icon="trending"
                        color={queueMetrics.serviceLevelPct >= 90 ? 'green' : 'yellow'}
                    />
                    <MetricCard
                        label="Handoff Rate"
                        value={handoffMetrics.handoffRate.toFixed(1) + '%'}
                        icon="activity"
                        color={handoffMetrics.handoffRate < 20 ? 'green' : 'yellow'}
                    />
                </div>

                {/* Queue & Handoff Status */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <QueueStatusCard metrics={queueMetrics} />
                    <HandoffMetricsCard metrics={handoffMetrics} />
                </div>

                {/* Live Calls Grid */}
                <Card title="Active Calls" headerContent={
                    <span className="text-sm text-dark-400">{totalActiveCalls} calls in progress</span>
                }>
                    {liveCalls.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {liveCalls.map((call) => (
                                <LiveCallCard
                                    key={call.callSid}
                                    call={call}
                                    onClick={() => setSelectedCall(call)}
                                    isSelected={selectedCall?.callSid === call.callSid}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            message="No active calls at this time. When calls come in, they will appear here in real-time."
                            icon={<Phone className="w-12 h-12 text-dark-500" />}
                        />
                    )}
                </Card>

                {/* Selected Call Detail Panel */}
                {selectedCall && (
                    <CallDetailPanel
                        call={selectedCall}
                        onClose={() => setSelectedCall(null)}
                    />
                )}
            </div>
        </DashboardLayout>
    );
}
