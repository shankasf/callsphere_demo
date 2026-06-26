import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    LineChart,
    Line,
    AreaChart,
    Area,
    Legend,
} from 'recharts';
import { Card, EmptyState } from '../common';

// Muted, professional categorical palette. Teal anchors the brand; the rest are
// desaturated so charts read as data, not decoration.
const COLORS = ['#2dd4bf', '#60a5fa', '#a78bfa', '#fbbf24', '#f87171', '#f472b6', '#34d399'];

// Shared axis / grid / tooltip styling so every chart looks like one system.
const GRID_STROKE = '#1e293b';
const AXIS_STROKE = '#475569';
const AXIS_TICK = { fill: '#64748b', fontSize: 11 };
const TOOLTIP_STYLE = {
    backgroundColor: '#0d131f',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    fontSize: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
} as const;
const TOOLTIP_LABEL = { color: '#94a3b8' } as const;
const TOOLTIP_ITEM = { color: '#e9eef5' } as const;

interface ChartProps {
    title: string;
    data: any[];
    height?: number;
}

export function HourlyCallsChart({ title, data, height = 300 }: ChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card title={title}>
                <EmptyState message="No call data available" />
            </Card>
        );
    }

    const formattedData = data.map((d) => ({
        ...d,
        hour: `${d.hour}:00`,
    }));

    return (
        <Card title={title}>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={formattedData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="hour" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} cursor={{ stroke: '#334155' }} />
                        <Area
                            type="monotone"
                            dataKey="count"
                            stroke="#2dd4bf"
                            fill="url(#colorCalls)"
                            strokeWidth={2}
                        />
                        <defs>
                            <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.35} />
                                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}

export function AgentDistributionChart({ title, data, height = 300 }: ChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card title={title}>
                <EmptyState message="No agent data available" />
            </Card>
        );
    }

    return (
        <Card title={title}>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="count"
                            nameKey="agent_type"
                            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            labelLine={false}
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} cursor={{ fill: '#1e293b40' }} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}

export function DeviceStatusChart({ title, data, height = 300 }: ChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card title={title}>
                <EmptyState message="No device data available" />
            </Card>
        );
    }

    return (
        <Card title={title}>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical">
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis type="number" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis
                            dataKey="organization"
                            type="category"
                            stroke={AXIS_STROKE}
                            tick={AXIS_TICK} tickLine={false} axisLine={false}
                            width={100}
                            tickFormatter={(value) =>
                                value.length > 12 ? `${value.substring(0, 12)}...` : value
                            }
                        />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} cursor={{ fill: '#1e293b40' }} />
                        <Legend />
                        <Bar dataKey="online" stackId="a" fill="#10b981" name="Online" />
                        <Bar dataKey="offline" stackId="a" fill="#ef4444" name="Offline" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}

export function OSDistributionChart({ title, data, height = 300 }: ChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card title={title}>
                <EmptyState message="No OS data available" />
            </Card>
        );
    }

    return (
        <Card title={title}>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={90}
                            paddingAngle={2}
                            dataKey="count"
                            nameKey="os_name"
                        >
                            {data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} cursor={{ fill: '#1e293b40' }} />
                        <Legend />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}

export function TicketsByPriorityChart({ title, data, height = 300 }: ChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card title={title}>
                <EmptyState message="No ticket data available" />
            </Card>
        );
    }

    const priorityColors: Record<string, string> = {
        Critical: '#ef4444',
        High: '#f59e0b',
        Medium: '#3b82f6',
        Low: '#10b981',
    };

    return (
        <Card title={title}>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="priority" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} cursor={{ fill: '#1e293b40' }} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {data.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={priorityColors[entry.priority] || '#3b82f6'}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}

export function CostTrendChart({ title, data, height = 300 }: ChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card title={title}>
                <EmptyState message="No cost data available" />
            </Card>
        );
    }

    return (
        <Card title={title}>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="date" stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} />
                        <YAxis stroke={AXIS_STROKE} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                        <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            labelStyle={TOOLTIP_LABEL}
                            itemStyle={TOOLTIP_ITEM}
                            cursor={{ stroke: '#334155' }}
                            formatter={(value) => [`$${Number(value ?? 0).toFixed(2)}`, 'Cost']}
                        />
                        <Line
                            type="monotone"
                            dataKey="cost"
                            stroke="#8b5cf6"
                            strokeWidth={2}
                            dot={{ fill: '#8b5cf6', r: 4 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
}
