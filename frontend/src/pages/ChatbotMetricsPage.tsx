import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Wrench } from 'lucide-react';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, LoadingSpinner, EmptyState } from '../components/common';
import { demoApi } from '../services/api';
import { useIndustry } from '../context';

const RANGES = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: 'all', label: 'All time' },
];

export function ChatbotMetricsPage() {
    const { slug } = useIndustry();
    const [range, setRange] = useState('7d');
    const industry = slug || 'all';

    const { data, isLoading, isError } = useQuery({
        queryKey: ['chatbot-metrics', industry, range],
        queryFn: () => demoApi.getChatbotMetrics(industry, range),
        refetchInterval: 30_000,
    });

    const t = data?.totals;
    const maxDaily = Math.max(1, ...(data?.daily?.map((d) => d.messages) ?? [1]));

    return (
        <DashboardLayout
            title="Chatbot Metrics"
            subtitle="Text chat agent — engagement, tools, and bookings"
        >
            {/* Range selector */}
            <div className="flex items-center justify-end mb-4 gap-1.5">
                {RANGES.map((r) => (
                    <button
                        key={r.key}
                        onClick={() => setRange(r.key)}
                        className={
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ' +
                            (range === r.key
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-800 text-dark-300 hover:text-white')
                        }
                    >
                        {r.label}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="py-24 flex justify-center">
                    <LoadingSpinner size="lg" />
                </div>
            ) : isError ? (
                <EmptyState message="Couldn't load chatbot metrics." />
            ) : (
                <div className="space-y-6">
                    {/* KPI row */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                        <MetricCard label="Chat sessions" value={t?.sessions ?? 0} icon="users" color="primary" />
                        <MetricCard label="Messages" value={t?.messages ?? 0} icon="activity" color="blue"
                            hint={`${t?.avgMessagesPerSession ?? 0} avg / session`} />
                        <MetricCard label="Appointments booked" value={t?.bookings ?? 0} icon="ticket" color="green"
                            hint={`${t?.emailsSent ?? 0} confirmation emails sent`} />
                        <MetricCard label="Booking conversion" value={`${t?.conversionRate ?? 0}%`} icon="target" color="purple"
                            hint="sessions that booked" />
                        <MetricCard label="Tool calls" value={t?.toolCalls ?? 0} icon="zap" color="yellow" />
                        <MetricCard label="Knowledge lookups" value={t?.kbToolCalls ?? 0} icon="database" color="blue" />
                        <MetricCard label="Booking tool calls" value={t?.bookToolCalls ?? 0} icon="check-circle" color="green" />
                        <MetricCard label="Emails sent" value={t?.emailsSent ?? 0} icon="mail" color="orange" />
                    </div>

                    {/* Daily volume */}
                    <Card title="Daily chat volume">
                        {data?.daily?.length ? (
                            <div className="flex items-end gap-1.5 h-40 pt-2">
                                {data.daily.map((d) => (
                                    <div key={d.day} className="flex-1 flex flex-col items-center justify-end gap-1 group">
                                        <div
                                            className="w-full bg-primary-500/70 group-hover:bg-primary-400 rounded-t transition-all"
                                            style={{ height: `${(d.messages / maxDaily) * 100}%` }}
                                            title={`${d.day}: ${d.messages} messages, ${d.sessions} sessions`}
                                        />
                                        <span className="text-[9px] text-dark-500 rotate-0 truncate w-full text-center">
                                            {d.day.slice(5)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState message="No chat activity in this range yet." />
                        )}
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* By industry */}
                        <Card title="By industry">
                            {data?.byIndustry?.length ? (
                                <div className="space-y-2">
                                    {data.byIndustry.map((b) => (
                                        <div key={b.slug} className="flex items-center justify-between text-sm">
                                            <span className="text-dark-200 truncate">{b.name || b.slug}</span>
                                            <span className="text-dark-400 tabular-nums">
                                                {b.sessions} sess · {b.messages} msg
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState message="No data yet." />
                            )}
                        </Card>

                        {/* Top booked services */}
                        <Card title="Top booked services">
                            {data?.topServices?.length ? (
                                <div className="space-y-2">
                                    {data.topServices.map((s) => (
                                        <div key={s.service} className="flex items-center justify-between text-sm">
                                            <span className="text-dark-200 truncate pr-3">{s.service}</span>
                                            <span className="text-dark-400 tabular-nums">{s.count}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState message="No bookings yet." />
                            )}
                        </Card>
                    </div>

                    {/* Recent chats */}
                    <Card title="Recent conversations">
                        {data?.recent?.length ? (
                            <div className="divide-y divide-dark-800">
                                {data.recent.map((c, i) => (
                                    <div key={i} className="py-3 first:pt-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] uppercase tracking-wide text-primary-300 bg-primary-500/10 px-1.5 py-0.5 rounded">
                                                {c.industry_name}
                                            </span>
                                            {c.tool_calls?.length ? (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300">
                                                    <Wrench className="w-3 h-3" /> {c.tool_calls.join(', ')}
                                                </span>
                                            ) : null}
                                            <span className="ml-auto text-[11px] text-dark-500">{c.at}</span>
                                        </div>
                                        <p className="text-sm text-dark-300 flex gap-1.5">
                                            <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-dark-500" />
                                            <span className="truncate">{c.user_message}</span>
                                        </p>
                                        <p className="text-sm text-dark-100 mt-1 line-clamp-2">{c.assistant_message}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState message="No conversations recorded yet." />
                        )}
                    </Card>
                </div>
            )}
        </DashboardLayout>
    );
}

export default ChatbotMetricsPage;
