import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, EmptyState, LoadingSpinner } from '../components/common';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
} from 'recharts';
import {
    Activity,
    Zap,
    Volume2,
    AlertTriangle,
    Mic,
    Target,
    Signal,
    Timer,
    RefreshCw,
    BarChart3,
} from 'lucide-react';
import clsx from 'clsx';
import { dashboardApi } from '../services/api';

// Types for quality metrics
interface CallQualityMetrics {
    mos: number | null;
    packetLossInbound: number | null;
    packetLossOutbound: number | null;
    jitter: number | null;
    rtt: number | null;
    audioLevelHealth: number | null;
    qualityAlerts: Array<{ type: string; severity: string; message: string; timestamp: string }>;
}

interface LatencyMetrics {
    endToEndTurnLatency: number | null;
    asrLatency: number | null;
    llmLatencyFirstToken: number | null;
    llmLatencyFullResponse: number | null;
    ttsLatency: number | null;
}

interface ASRMetrics {
    transcriptConfidenceAvg: number | null;
    transcriptConfidenceDistribution: Array<{ range: string; percentage: number }>;
    wordErrorRateProxy: number | null;
    noSpeechDetectedRate: number | null;
}

interface NLUMetrics {
    intentMatchRate: number | null;
    fallbackRate: number | null;
    entityExtractionSuccessRate: number | null;
    topConfusionPairs: Array<{ intentA: string; intentB: string; confusionRate: number }>;
}

interface ConversationFlowMetrics {
    taskCompletionRate: number | null;
    turnsPerCall: number | null;
    avgTimeToResolution: number | null;
    dropOffByStep: Array<{ step: string; dropOffRate: number }>;
}

interface QualityData {
    callQuality: CallQualityMetrics;
    latency: LatencyMetrics;
    asr: ASRMetrics;
    nlu: NLUMetrics;
    conversationFlow: ConversationFlowMetrics;
}

// Empty metrics defaults
const emptyQualityData: QualityData = {
    callQuality: {
        mos: null,
        packetLossInbound: null,
        packetLossOutbound: null,
        jitter: null,
        rtt: null,
        audioLevelHealth: null,
        qualityAlerts: [],
    },
    latency: {
        endToEndTurnLatency: null,
        asrLatency: null,
        llmLatencyFirstToken: null,
        llmLatencyFullResponse: null,
        ttsLatency: null,
    },
    asr: {
        transcriptConfidenceAvg: null,
        transcriptConfidenceDistribution: [],
        wordErrorRateProxy: null,
        noSpeechDetectedRate: null,
    },
    nlu: {
        intentMatchRate: null,
        fallbackRate: null,
        entityExtractionSuccessRate: null,
        topConfusionPairs: [],
    },
    conversationFlow: {
        taskCompletionRate: null,
        turnsPerCall: null,
        avgTimeToResolution: null,
        dropOffByStep: [],
    },
};

// Helper to display value or "No data"
function MetricValue({ value, suffix = '', format = 'default' }: { value: number | null; suffix?: string; format?: 'default' | 'fixed1' | 'fixed2' }) {
    if (value === null || value === undefined) {
        return <span className="text-dark-500">—</span>;
    }
    let formattedValue = value.toString();
    if (format === 'fixed1') formattedValue = value.toFixed(1);
    if (format === 'fixed2') formattedValue = value.toFixed(2);
    return <>{formattedValue}{suffix}</>;
}

// MOS Score Display
function MOSScoreDisplay({ score }: { score: number | null }) {
    if (score === null) {
        return (
            <div className="flex flex-col items-center">
                <div className="text-4xl font-bold text-dark-500">—</div>
                <div className="text-sm text-dark-500 mt-1">No Data</div>
                <div className="text-xs text-dark-500">MOS Score</div>
            </div>
        );
    }

    const getColor = (s: number) => {
        if (s >= 4.0) return 'text-green-400';
        if (s >= 3.5) return 'text-yellow-400';
        if (s >= 3.0) return 'text-orange-400';
        return 'text-red-400';
    };

    const getLabel = (s: number) => {
        if (s >= 4.0) return 'Excellent';
        if (s >= 3.5) return 'Good';
        if (s >= 3.0) return 'Fair';
        return 'Poor';
    };

    return (
        <div className="flex flex-col items-center">
            <div className={clsx('text-4xl font-bold', getColor(score))}>
                {score.toFixed(2)}
            </div>
            <div className="text-sm text-dark-400 mt-1">{getLabel(score)}</div>
            <div className="text-xs text-dark-500">MOS Score</div>
        </div>
    );
}

// Call Quality Card
function CallQualityCard({ metrics }: { metrics: CallQualityMetrics }) {
    const hasData = metrics.mos !== null || metrics.packetLossInbound !== null || metrics.jitter !== null;

    if (!hasData) {
        return (
            <Card title="Network Quality" className="h-full">
                <EmptyState
                    message="No network quality data available. Data will appear once calls are processed."
                    icon={<Signal className="w-12 h-12 text-dark-500" />}
                />
            </Card>
        );
    }

    const getLatencyColor = (value: number | null, thresholds: [number, number]) => {
        if (value === null) return 'text-dark-500';
        if (value < thresholds[0]) return 'text-green-400';
        if (value < thresholds[1]) return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <Card title="Network Quality" className="h-full">
            <div className="space-y-4">
                {/* MOS Score */}
                <div className="flex items-center justify-center p-4 bg-dark-800 rounded-xl">
                    <MOSScoreDisplay score={metrics.mos} />
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-dark-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Signal className="w-4 h-4 text-blue-400" />
                            <span className="text-xs text-dark-400">Packet Loss</span>
                        </div>
                        <p className={clsx('text-lg font-semibold', getLatencyColor(metrics.packetLossInbound, [1, 3]))}>
                            <MetricValue value={metrics.packetLossInbound} suffix="%" format="fixed2" />
                        </p>
                    </div>
                    <div className="bg-dark-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Activity className="w-4 h-4 text-purple-400" />
                            <span className="text-xs text-dark-400">Jitter</span>
                        </div>
                        <p className={clsx('text-lg font-semibold', getLatencyColor(metrics.jitter, [20, 40]))}>
                            <MetricValue value={metrics.jitter} suffix="ms" />
                        </p>
                    </div>
                    <div className="bg-dark-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Timer className="w-4 h-4 text-cyan-400" />
                            <span className="text-xs text-dark-400">RTT</span>
                        </div>
                        <p className={clsx('text-lg font-semibold', getLatencyColor(metrics.rtt, [100, 200]))}>
                            <MetricValue value={metrics.rtt} suffix="ms" />
                        </p>
                    </div>
                    <div className="bg-dark-800 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                            <Volume2 className="w-4 h-4 text-green-400" />
                            <span className="text-xs text-dark-400">Audio Health</span>
                        </div>
                        <p className="text-lg font-semibold text-green-400">
                            <MetricValue value={metrics.audioLevelHealth} suffix="%" />
                        </p>
                    </div>
                </div>

                {/* Alerts */}
                {metrics.qualityAlerts.length > 0 && (
                    <div className="space-y-2">
                        {metrics.qualityAlerts.map((alert, i) => (
                            <div key={i} className={clsx(
                                'flex items-center gap-2 p-2 rounded-lg text-sm',
                                alert.severity === 'critical' ? 'bg-red-600/20 text-red-400' : 'bg-yellow-600/20 text-yellow-400'
                            )}>
                                <AlertTriangle className="w-4 h-4" />
                                {alert.message}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
}

// Latency Breakdown Card
function LatencyBreakdownCard({ metrics }: { metrics: LatencyMetrics }) {
    const hasData = metrics.endToEndTurnLatency !== null || metrics.asrLatency !== null;

    if (!hasData) {
        return (
            <Card title="Response Latency Breakdown" className="h-full">
                <EmptyState
                    message="No latency data available. Data will appear once calls are processed."
                    icon={<Zap className="w-12 h-12 text-dark-500" />}
                />
            </Card>
        );
    }

    const totalLatency = metrics.endToEndTurnLatency || 1;
    const latencyData = [
        { name: 'ASR', value: metrics.asrLatency, color: '#3b82f6' },
        { name: 'LLM (First Token)', value: metrics.llmLatencyFirstToken, color: '#8b5cf6' },
        { name: 'TTS', value: metrics.ttsLatency, color: '#10b981' },
    ].filter(item => item.value !== null);

    return (
        <Card title="Response Latency Breakdown" className="h-full">
            <div className="space-y-4">
                {/* Total E2E Latency */}
                <div className="flex items-center justify-between p-4 bg-dark-800 rounded-xl">
                    <div>
                        <p className="text-dark-400 text-sm">End-to-End Turn Latency</p>
                        <p className="text-3xl font-bold text-primary-400">
                            <MetricValue value={metrics.endToEndTurnLatency} suffix="ms" />
                        </p>
                    </div>
                    <div className="w-16 h-16 rounded-full border-4 border-primary-500 flex items-center justify-center">
                        <Zap className="w-6 h-6 text-primary-400" />
                    </div>
                </div>

                {/* Latency Breakdown */}
                {latencyData.length > 0 ? (
                    <div className="space-y-3">
                        {latencyData.map((item, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="w-24 text-sm text-dark-400">{item.name}</div>
                                <div className="flex-1 bg-dark-700 rounded-full h-3">
                                    <div
                                        className="h-3 rounded-full transition-all duration-500"
                                        style={{
                                            width: `${((item.value || 0) / totalLatency) * 100}%`,
                                            backgroundColor: item.color,
                                        }}
                                    />
                                </div>
                                <div className="w-16 text-sm text-right">{item.value}ms</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-dark-500 text-center py-4">No breakdown data available</p>
                )}
            </div>
        </Card>
    );
}

// ASR Performance Card
function ASRPerformanceCard({ metrics }: { metrics: ASRMetrics }) {
    const hasData = metrics.transcriptConfidenceAvg !== null;

    if (!hasData) {
        return (
            <Card title="Speech Recognition (ASR)" className="h-full">
                <EmptyState
                    message="No speech recognition data available. Data will appear once calls are processed."
                    icon={<Mic className="w-12 h-12 text-dark-500" />}
                />
            </Card>
        );
    }

    return (
        <Card title="Speech Recognition (ASR)" className="h-full">
            <div className="space-y-4">
                {/* Confidence Score */}
                <div className="flex items-center justify-between p-4 bg-dark-800 rounded-xl">
                    <div>
                        <p className="text-dark-400 text-sm">Avg Confidence</p>
                        <p className="text-3xl font-bold text-green-400">
                            <MetricValue value={metrics.transcriptConfidenceAvg} suffix="%" format="fixed1" />
                        </p>
                    </div>
                    <Mic className="w-10 h-10 text-green-400 opacity-50" />
                </div>

                {/* Confidence Distribution */}
                {metrics.transcriptConfidenceDistribution.length > 0 ? (
                    <div>
                        <p className="text-xs text-dark-400 mb-2">Confidence Distribution</p>
                        <div className="h-32">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={metrics.transcriptConfidenceDistribution} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis type="number" stroke="#94a3b8" fontSize={10} />
                                    <YAxis dataKey="range" type="category" stroke="#94a3b8" fontSize={10} width={60} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                                    />
                                    <Bar dataKey="percentage" fill="#10b981" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-dark-500 text-center py-4">No distribution data available</p>
                )}

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-dark-800 rounded-lg p-3">
                        <p className="text-xs text-dark-400">WER Proxy</p>
                        <p className="text-lg font-semibold">
                            <MetricValue value={metrics.wordErrorRateProxy} suffix="%" format="fixed1" />
                        </p>
                    </div>
                    <div className="bg-dark-800 rounded-lg p-3">
                        <p className="text-xs text-dark-400">No Speech Rate</p>
                        <p className="text-lg font-semibold">
                            <MetricValue value={metrics.noSpeechDetectedRate} suffix="%" format="fixed1" />
                        </p>
                    </div>
                </div>
            </div>
        </Card>
    );
}

// NLU Performance Card
function NLUPerformanceCard({ metrics }: { metrics: NLUMetrics }) {
    const hasData = metrics.intentMatchRate !== null || metrics.fallbackRate !== null;

    if (!hasData) {
        return (
            <Card title="Natural Language Understanding (NLU)" className="h-full">
                <EmptyState
                    message="No NLU data available. Data will appear once calls are processed."
                    icon={<Target className="w-12 h-12 text-dark-500" />}
                />
            </Card>
        );
    }

    const radarData = [
        { metric: 'Intent Match', value: metrics.intentMatchRate || 0 },
        { metric: 'Entity Extract', value: metrics.entityExtractionSuccessRate || 0 },
        { metric: 'Low Fallback', value: 100 - (metrics.fallbackRate || 0) },
    ].filter(item => item.value > 0);

    return (
        <Card title="Natural Language Understanding (NLU)" className="h-full">
            <div className="space-y-4">
                {/* Radar Chart */}
                {radarData.length > 0 ? (
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart data={radarData}>
                                <PolarGrid stroke="#334155" />
                                <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                <Radar
                                    name="Performance"
                                    dataKey="value"
                                    stroke="#3b82f6"
                                    fill="#3b82f6"
                                    fillOpacity={0.3}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-sm text-dark-500 text-center py-8">No performance data available</p>
                )}

                {/* Key Metrics */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="text-center p-2 bg-dark-800 rounded-lg">
                        <p className="text-lg font-semibold text-green-400">
                            <MetricValue value={metrics.intentMatchRate} suffix="%" format="fixed1" />
                        </p>
                        <p className="text-xs text-dark-400">Intent Match</p>
                    </div>
                    <div className="text-center p-2 bg-dark-800 rounded-lg">
                        <p className="text-lg font-semibold text-yellow-400">
                            <MetricValue value={metrics.fallbackRate} suffix="%" format="fixed1" />
                        </p>
                        <p className="text-xs text-dark-400">Fallback Rate</p>
                    </div>
                </div>

                {/* Confusion Pairs */}
                {metrics.topConfusionPairs.length > 0 && (
                    <div>
                        <p className="text-xs text-dark-400 mb-2">Top Intent Confusion Pairs</p>
                        <div className="space-y-2">
                            {metrics.topConfusionPairs.map((pair, i) => (
                                <div key={i} className="flex items-center gap-2 p-2 bg-dark-800 rounded-lg text-sm">
                                    <span className="text-dark-300">{pair.intentA}</span>
                                    <span className="text-dark-500">↔</span>
                                    <span className="text-dark-300">{pair.intentB}</span>
                                    <span className="ml-auto text-yellow-400">{pair.confusionRate}%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}

// Conversation Flow Card
function ConversationFlowCard({ metrics }: { metrics: ConversationFlowMetrics }) {
    const hasData = metrics.taskCompletionRate !== null || metrics.avgTimeToResolution !== null;

    if (!hasData) {
        return (
            <Card title="Conversation Flow Analysis">
                <EmptyState
                    message="No conversation flow data available. Data will appear once calls are processed."
                    icon={<BarChart3 className="w-12 h-12 text-dark-500" />}
                />
            </Card>
        );
    }

    return (
        <Card title="Conversation Flow" className="h-full">
            <div className="space-y-4">
                {/* Key Stats */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-dark-800 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                            <Target className="w-5 h-5 text-green-400" />
                            <span className="text-dark-400">Task Completion</span>
                        </div>
                        <p className="text-2xl font-bold text-green-400">
                            <MetricValue value={metrics.taskCompletionRate} suffix="%" format="fixed1" />
                        </p>
                    </div>
                    <div className="p-4 bg-dark-800 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                            <Timer className="w-5 h-5 text-blue-400" />
                            <span className="text-dark-400">Avg Resolution</span>
                        </div>
                        <p className="text-2xl font-bold text-blue-400">
                            <MetricValue value={metrics.avgTimeToResolution} suffix="s" />
                        </p>
                    </div>
                </div>

                {/* Drop-off Funnel */}
                {metrics.dropOffByStep.length > 0 && (
                    <div>
                        <p className="text-xs text-dark-400 mb-2">Drop-off by Step</p>
                        <div className="space-y-2">
                            {metrics.dropOffByStep.map((step, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-32 text-sm text-dark-300 truncate">{step.step}</div>
                                    <div className="flex-1 bg-dark-700 rounded-full h-2">
                                        <div
                                            className="bg-red-500 h-2 rounded-full"
                                            style={{ width: `${step.dropOffRate}%` }}
                                        />
                                    </div>
                                    <div className="w-12 text-sm text-right text-red-400">{step.dropOffRate}%</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
}

export function QualityMetricsPage() {
    const [data, setData] = useState<QualityData>(emptyQualityData);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    // Fetch quality metrics from API
    const fetchData = useCallback(async () => {
        try {
            const response = await dashboardApi.getQualityMetrics();
            if (response) {
                setData({
                    callQuality: response.callQuality || emptyQualityData.callQuality,
                    latency: response.latency || emptyQualityData.latency,
                    asr: response.asr || emptyQualityData.asr,
                    nlu: response.nlu || emptyQualityData.nlu,
                    conversationFlow: response.conversationFlow || emptyQualityData.conversationFlow,
                });
                setLastRefresh(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch quality metrics:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch and periodic refresh
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (isLoading) {
        return (
            <DashboardLayout
                title="Quality & Performance"
                subtitle="Call quality, AI performance, and conversation flow metrics"
            >
                <div className="flex items-center justify-center h-96">
                    <LoadingSpinner size="lg" />
                </div>
            </DashboardLayout>
        );
    }

    const { callQuality, latency, asr, nlu, conversationFlow } = data;

    return (
        <DashboardLayout
            title="Quality & Performance"
            subtitle="Call quality, AI performance, and conversation flow metrics"
            headerContent={
                <div className="flex items-center gap-4">
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
                {/* Top Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                    <MetricCard
                        label="MOS Score"
                        value={callQuality.mos !== null ? callQuality.mos.toFixed(2) : '—'}
                        icon="activity"
                        color={callQuality.mos !== null ? (callQuality.mos >= 4 ? 'green' : callQuality.mos >= 3.5 ? 'yellow' : 'red') : 'gray'}
                    />
                    <MetricCard
                        label="E2E Latency"
                        value={latency.endToEndTurnLatency !== null ? `${latency.endToEndTurnLatency}ms` : '—'}
                        icon="zap"
                        color={latency.endToEndTurnLatency !== null ? (latency.endToEndTurnLatency < 500 ? 'green' : latency.endToEndTurnLatency < 800 ? 'yellow' : 'red') : 'gray'}
                    />
                    <MetricCard
                        label="ASR Confidence"
                        value={asr.transcriptConfidenceAvg !== null ? `${asr.transcriptConfidenceAvg.toFixed(0)}%` : '—'}
                        icon="activity"
                        color="blue"
                    />
                    <MetricCard
                        label="Intent Match"
                        value={nlu.intentMatchRate !== null ? `${nlu.intentMatchRate.toFixed(0)}%` : '—'}
                        icon="target"
                        color="purple"
                    />
                    <MetricCard
                        label="Task Completion"
                        value={conversationFlow.taskCompletionRate !== null ? `${conversationFlow.taskCompletionRate.toFixed(0)}%` : '—'}
                        icon="check"
                        color="green"
                    />
                    <MetricCard
                        label="Fallback Rate"
                        value={nlu.fallbackRate !== null ? `${nlu.fallbackRate.toFixed(1)}%` : '—'}
                        icon="alert-triangle"
                        color={nlu.fallbackRate !== null ? (nlu.fallbackRate < 5 ? 'green' : nlu.fallbackRate < 10 ? 'yellow' : 'red') : 'gray'}
                    />
                </div>

                {/* Call Quality & Latency */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <CallQualityCard metrics={callQuality} />
                    <LatencyBreakdownCard metrics={latency} />
                </div>

                {/* ASR & NLU */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ASRPerformanceCard metrics={asr} />
                    <NLUPerformanceCard metrics={nlu} />
                </div>

                {/* Conversation Flow */}
                <ConversationFlowCard metrics={conversationFlow} />
            </div>
        </DashboardLayout>
    );
}
