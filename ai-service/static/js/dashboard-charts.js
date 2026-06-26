/**
 * U Rack IT Dashboard - Part 3
 * Chart rendering functions and utilities
 */

// =====================================================
// CHART RENDERING FUNCTIONS
// =====================================================

function renderHourlyCallsChart(data) {
    const el = document.querySelector("#hourlyCallsChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No call data available</p></div>';
        return;
    }

    const hours = data.map(d => formatHour(d.hour));
    const counts = data.map(d => d.call_count);

    new ApexCharts(document.querySelector("#hourlyCallsChart"), {
        chart: { type: 'area', height: '100%', toolbar: { show: false }, background: 'transparent' },
        series: [{ name: 'Calls', data: counts }],
        xaxis: { categories: hours },
        colors: ['#06b6d4'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.5, opacityTo: 0.1 } },
        stroke: { curve: 'smooth', width: 2 },
        dataLabels: { enabled: false },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderAgentDistributionChart(data) {
    const el = document.querySelector("#agentDistChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No agent data available</p></div>';
        return;
    }

    const labels = data.map(d => d.agent_type);
    const values = data.map(d => d.count);

    new ApexCharts(document.querySelector("#agentDistChart"), {
        chart: { type: 'donut', height: '100%', background: 'transparent' },
        series: values,
        labels: labels,
        colors: ['#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'],
        legend: { position: 'bottom', labels: { colors: '#9ca3af' } },
        plotOptions: { pie: { donut: { size: '65%' } } },
        dataLabels: { enabled: true, style: { colors: ['#fff'] } },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderCallsHourlyChart(data) {
    const el = document.querySelector("#callsHourlyChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No call data available</p></div>';
        return;
    }

    const hours = data.map(d => formatHour(d.hour));
    const counts = data.map(d => d.call_count);
    const durations = data.map(d => d.avg_duration);

    new ApexCharts(document.querySelector("#callsHourlyChart"), {
        chart: { type: 'line', height: '100%', toolbar: { show: false }, background: 'transparent' },
        series: [
            { name: 'Calls', type: 'column', data: counts },
            { name: 'Avg Duration (s)', type: 'line', data: durations }
        ],
        xaxis: { categories: hours },
        yaxis: [
            { title: { text: 'Calls' } },
            { opposite: true, title: { text: 'Duration' } }
        ],
        colors: ['#06b6d4', '#f59e0b'],
        stroke: { width: [0, 3], curve: 'smooth' },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderCallDirectionChart(inbound, outbound) {
    const el = document.querySelector("#callDirectionChart");
    if (!el) return;

    if (inbound === 0 && outbound === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No call data available</p></div>';
        return;
    }

    new ApexCharts(el, {
        chart: { type: 'pie', height: '100%', background: 'transparent' },
        series: [inbound, outbound],
        labels: ['Inbound', 'Outbound'],
        colors: ['#06b6d4', '#8b5cf6'],
        legend: { position: 'bottom', labels: { colors: '#9ca3af' } },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderCallStatusChart(completed, answered, voicemail, no_answer) {
    new ApexCharts(document.querySelector("#callStatusChart"), {
        chart: { type: 'donut', height: '100%', background: 'transparent' },
        series: [completed, answered, voicemail, no_answer],
        labels: ['Completed', 'Answered', 'Voicemail', 'No Answer'],
        colors: ['#10b981', '#06b6d4', '#f59e0b', '#ef4444'],
        legend: { position: 'bottom', labels: { colors: '#9ca3af' } },
        plotOptions: { pie: { donut: { size: '60%' } } },
        theme: { mode: 'dark' }
    }).render();
}

function renderAIAgentChart(data) {
    if (!data || data.length === 0) {
        const el = document.querySelector("#aiAgentChart");
        if (el) el.innerHTML = '<p class="text-dark-400 text-center py-8">No agent data available</p>';
        return;
    }

    const labels = data.map(d => formatAgentName(d.agent_type));
    const values = data.map(d => d.count);

    new ApexCharts(document.querySelector("#aiAgentChart"), {
        chart: { type: 'bar', height: '100%', toolbar: { show: false }, background: 'transparent' },
        series: [{ name: 'Interactions', data: values }],
        xaxis: { categories: labels },
        colors: ['#8b5cf6'],
        plotOptions: { bar: { borderRadius: 4, horizontal: true } },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderAIResolutionChart(resolved, total) {
    const unresolved = total - resolved;

    new ApexCharts(document.querySelector("#aiResolutionChart"), {
        chart: { type: 'radialBar', height: '100%', background: 'transparent' },
        series: [Math.round((resolved / total) * 100) || 0],
        labels: ['Resolution Rate'],
        colors: ['#10b981'],
        plotOptions: {
            radialBar: {
                hollow: { size: '70%' },
                dataLabels: {
                    name: { fontSize: '16px', color: '#9ca3af' },
                    value: { fontSize: '24px', color: '#fff' }
                }
            }
        },
        theme: { mode: 'dark' }
    }).render();
}

function renderTicketsByPriorityChart(data) {
    const el = document.querySelector("#ticketsByPriorityChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No ticket data available</p></div>';
        return;
    }

    const labels = data.map(d => d.priority);
    const values = data.map(d => d.count);

    new ApexCharts(document.querySelector("#ticketsByPriorityChart"), {
        chart: { type: 'bar', height: '100%', toolbar: { show: false }, background: 'transparent' },
        series: [{ name: 'Tickets', data: values }],
        xaxis: { categories: labels },
        colors: ['#f59e0b'],
        plotOptions: { bar: { borderRadius: 4 } },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderOpenTicketsChart(data) {
    const el = document.querySelector("#openTicketsChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No ticket data available</p></div>';
        return;
    }

    const labels = data.map(d => d.priority);
    const values = data.map(d => d.count);

    new ApexCharts(document.querySelector("#openTicketsChart"), {
        chart: { type: 'donut', height: '100%', background: 'transparent' },
        series: values,
        labels: labels,
        colors: ['#ef4444', '#f59e0b', '#fbbf24', '#10b981'],
        legend: { position: 'bottom', labels: { colors: '#9ca3af' } },
        theme: { mode: 'dark' }
    }).render();
}

function renderCSATChart(data) {
    const el = document.querySelector("#csatChart");
    if (!el) return;

    const labels = ['1 Star', '2 Stars', '3 Stars', '4 Stars', '5 Stars'];
    const values = [0, 0, 0, 0, 0];

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No CSAT data available</p></div>';
        return;
    }

    data.forEach(d => {
        if (d.score >= 1 && d.score <= 5) values[d.score - 1] = d.count;
    });

    new ApexCharts(document.querySelector("#csatChart"), {
        chart: { type: 'bar', height: '100%', toolbar: { show: false }, background: 'transparent' },
        series: [{ name: 'Ratings', data: values }],
        xaxis: { categories: labels },
        colors: ['#fbbf24'],
        plotOptions: { bar: { borderRadius: 4 } },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderCallerTypeChart(newCallers, repeatCallers) {
    const el = document.querySelector("#callerTypeChart");
    if (!el) return;

    if (newCallers === 0 && repeatCallers === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No caller data available</p></div>';
        return;
    }

    new ApexCharts(el, {
        chart: { type: 'pie', height: '100%', background: 'transparent' },
        series: [newCallers, repeatCallers],
        labels: ['New Callers', 'Repeat Callers'],
        colors: ['#10b981', '#8b5cf6'],
        legend: { position: 'bottom', labels: { colors: '#9ca3af' } },
        theme: { mode: 'dark' }
    }).render();
}

function renderOrgCallsChart(data) {
    const el = document.querySelector("#orgCallsChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No organization data available</p></div>';
        return;
    }

    const labels = data.map(d => d.organization);
    const values = data.map(d => d.call_count);

    new ApexCharts(document.querySelector("#orgCallsChart"), {
        chart: { type: 'bar', height: '100%', toolbar: { show: false }, background: 'transparent' },
        series: [{ name: 'Calls', data: values }],
        xaxis: { categories: labels },
        colors: ['#06b6d4'],
        plotOptions: { bar: { borderRadius: 4 } },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderCostDistributionChart(aiCost, twilioCost) {
    const el = document.querySelector("#costDistChart");
    if (!el) return;

    if (aiCost === 0 && twilioCost === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No cost data available</p></div>';
        return;
    }

    new ApexCharts(el, {
        chart: { type: 'pie', height: '100%', background: 'transparent' },
        series: [aiCost, twilioCost],
        labels: ['AI (OpenAI)', 'Twilio'],
        colors: ['#8b5cf6', '#06b6d4'],
        legend: { position: 'bottom', labels: { colors: '#9ca3af' } },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark', y: { formatter: (val) => '$' + val.toFixed(2) } }
    }).render();
}

function renderDailyTrendChart(data) {
    const el = document.querySelector("#dailyTrendChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No trend data available</p></div>';
        return;
    }

    const dates = data.map(d => d.date);
    const calls = data.map(d => d.total_calls);
    const resolved = data.map(d => d.resolved_calls);

    new ApexCharts(document.querySelector("#dailyTrendChart"), {
        chart: { type: 'area', height: '100%', toolbar: { show: false }, background: 'transparent' },
        series: [
            { name: 'Total Calls', data: calls },
            { name: 'Resolved', data: resolved }
        ],
        xaxis: { categories: dates, type: 'datetime' },
        colors: ['#06b6d4', '#10b981'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0.1 } },
        stroke: { curve: 'smooth', width: 2 },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

function renderSentimentChart(data) {
    const el = document.querySelector("#sentimentChart");
    if (!el) return;

    if (!data || data.length === 0) {
        el.innerHTML = '<div class="flex items-center justify-center h-full text-dark-400"><p>No sentiment data available</p></div>';
        return;
    }

    const dates = data.map(d => d.date);
    const positive = data.map(d => d.positive || 0);
    const neutral = data.map(d => d.neutral || 0);
    const negative = data.map(d => d.negative || 0);

    new ApexCharts(document.querySelector("#sentimentChart"), {
        chart: { type: 'area', height: '100%', stacked: true, toolbar: { show: false }, background: 'transparent' },
        series: [
            { name: 'Positive', data: positive },
            { name: 'Neutral', data: neutral },
            { name: 'Negative', data: negative }
        ],
        xaxis: { categories: dates, type: 'datetime' },
        colors: ['#10b981', '#6b7280', '#ef4444'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.6, opacityTo: 0.2 } },
        stroke: { curve: 'smooth', width: 0 },
        grid: { borderColor: '#374151' },
        theme: { mode: 'dark' },
        tooltip: { theme: 'dark' }
    }).render();
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function formatDuration(seconds) {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

function formatHour(hour) {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return hour + ' AM';
    return (hour - 12) + ' PM';
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

function formatAgentName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function maskPhone(phone) {
    if (!phone || phone.length < 4) return phone || '';
    return phone.slice(0, -4).replace(/./g, '*') + phone.slice(-4);
}

function getPriorityBadge(priority) {
    const badges = {
        'Critical': 'px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs',
        'High': 'px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs',
        'Medium': 'px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs',
        'Low': 'px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs'
    };
    return badges[priority] || badges['Medium'];
}

function getPriorityColor(priority) {
    const colors = {
        'Critical': 'bg-red-500',
        'High': 'bg-orange-500',
        'Medium': 'bg-yellow-500',
        'Low': 'bg-green-500'
    };
    return colors[priority] || colors['Medium'];
}

// =====================================================
// RENDER COMPONENT FUNCTIONS
// =====================================================

function renderMetricCard(label, value, icon, color) {
    const colors = {
        primary: 'bg-primary-600/20 text-primary-400',
        blue: 'bg-blue-600/20 text-blue-400',
        green: 'bg-green-600/20 text-green-400',
        yellow: 'bg-yellow-600/20 text-yellow-400',
        orange: 'bg-orange-600/20 text-orange-400',
        red: 'bg-red-600/20 text-red-400',
        purple: 'bg-purple-600/20 text-purple-400'
    };

    const icons = {
        phone: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
        cpu: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
        clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        activity: 'M13 10V3L4 14h7v7l9-11h-7z',
        ticket: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
        server: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
        users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
        check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        'check-circle': 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        'arrow-up': 'M5 10l7-7m0 0l7 7m-7-7v18',
        trending: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
        'folder-open': 'M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z',
        plus: 'M12 4v16m8-8H4',
        shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
        'dollar-sign': 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        zap: 'M13 10V3L4 14h7v7l9-11h-7z',
        target: 'M12 8v4l3 3M3 12a9 9 0 1118 0 9 9 0 01-18 0z',
        refresh: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
        repeat: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
        'user-plus': 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
        star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
        hourglass: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        x: 'M6 18L18 6M6 6l12 12',
        'trending-down': 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
        'alert-triangle': 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
        default: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'
    };

    const iconPath = icons[icon] || icons.default;

    return `
        <div class="glass rounded-xl p-3 md:p-4 metric-card">
            <div class="flex items-center gap-2 md:gap-3">
                <div class="w-8 h-8 md:w-10 md:h-10 ${colors[color] || colors.primary} rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg class="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"/>
                    </svg>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-dark-400 text-xs md:text-sm truncate">${label}</p>
                    <p class="value-text font-bold truncate">${value}</p>
                </div>
            </div>
        </div>
    `;
}

function renderStatCard(label, value, subtitle, color = 'primary') {
    const colors = {
        primary: 'text-primary-400',
        green: 'text-green-400',
        yellow: 'text-yellow-400',
        red: 'text-red-400'
    };

    return `
        <div class="glass rounded-xl p-4 text-center overflow-hidden">
            <p class="stat-value font-bold ${colors[color] || colors.primary} truncate">${value}</p>
            <p class="font-medium mt-1 text-sm md:text-base truncate">${label}</p>
            <p class="text-xs md:text-sm text-dark-400 truncate">${subtitle}</p>
        </div>
    `;
}

function renderGaugeCard(label, value, unit, color, subtitle = '') {
    const colors = {
        primary: { bg: 'bg-primary-600', ring: 'ring-primary-600/30' },
        purple: { bg: 'bg-purple-600', ring: 'ring-purple-600/30' },
        blue: { bg: 'bg-blue-600', ring: 'ring-blue-600/30' },
        green: { bg: 'bg-green-600', ring: 'ring-green-600/30' }
    };
    const c = colors[color] || colors.primary;
    const percent = Math.min(value, 100);

    return `
        <div class="glass rounded-xl p-3 md:p-4 overflow-hidden">
            <div class="flex items-center justify-between mb-2 md:mb-3 gap-2">
                <span class="font-medium text-sm md:text-base truncate">${label}</span>
                <span class="text-xs md:text-sm text-dark-400 flex-shrink-0">${value}${unit}</span>
            </div>
            <div class="w-full bg-dark-700 rounded-full h-2 md:h-3">
                <div class="${c.bg} h-2 md:h-3 rounded-full transition-all duration-500" style="width: ${percent}%"></div>
            </div>
            ${subtitle ? `<p class="text-xs text-dark-400 mt-2 truncate">${subtitle}</p>` : ''}
        </div>
    `;
}

function renderLatencyCard(label, value) {
    const getColor = (v) => {
        if (v < 100) return 'text-green-400';
        if (v < 300) return 'text-yellow-400';
        return 'text-red-400';
    };

    return `
        <div class="glass rounded-xl p-3 md:p-4 text-center overflow-hidden">
            <p class="text-xl md:text-2xl font-bold ${getColor(value)}">${value}ms</p>
            <p class="text-xs md:text-sm text-dark-400 mt-1 truncate">${label}</p>
        </div>
    `;
}

// =====================================================
// MOCK DATA FUNCTIONS
// =====================================================

function getMockOverviewData() {
    return {
        total_calls: 156,
        completed_calls: 142,
        avg_call_duration_seconds: 185.4,
        ai_resolution_rate_percent: 87.5,
        active_sessions: 3,
        total_tokens_today: 52340,
        total_cost_today: 2.34,
        uptime_percent: 99.9,
        hourly_calls: Array.from({ length: 24 }, (_, i) => ({ hour: i, call_count: Math.floor(Math.random() * 15) })),
        agent_distribution: [
            { agent_type: 'triage', count: 45 },
            { agent_type: 'ticket', count: 32 },
            { agent_type: 'network', count: 28 },
            { agent_type: 'device', count: 21 }
        ]
    };
}

function getMockCallData() {
    return {
        total_calls_today: 156,
        completed_calls: 142,
        answered_calls: 148,
        voicemail_calls: 8,
        missed_calls: 0,
        avg_duration_seconds: 185.4,
        total_duration_seconds: 28922,
        peak_hour: 10,
        inbound_calls: 120,
        outbound_calls: 36,
        concurrent_calls_peak: 5,
        call_wait_time_avg: 2.3,
        calls_with_transfer: 12,
        calls_with_conference: 5,
        avg_agent_interactions: 2.1,
        hourly_breakdown: Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            call_count: Math.floor(Math.random() * 15),
            avg_duration: Math.floor(Math.random() * 300)
        }))
    };
}

function getMockAIData() {
    return {
        total_ai_interactions: 456,
        successful_resolutions: 398,
        ai_resolution_rate: 87.3,
        avg_response_time_ms: 234,
        total_tokens_used: 52340,
        input_tokens: 18500,
        output_tokens: 33840,
        total_ai_cost_usd: 1.87,
        fallback_to_human: 8,
        avg_sentiment_score: 0.72,
        tool_calls_made: 234,
        cache_hit_rate: 45.2,
        knowledge_base_queries: 189,
        agent_usage: [
            { agent_type: 'triage', count: 156 },
            { agent_type: 'ticket', count: 98 },
            { agent_type: 'network', count: 76 },
            { agent_type: 'device', count: 58 },
            { agent_type: 'email', count: 42 },
            { agent_type: 'printer', count: 26 }
        ]
    };
}

function getMockTicketData() {
    return {
        tickets_created_today: 34,
        open_tickets: 23,
        pending_tickets: 12,
        resolved_tickets: 45,
        escalated_tickets: 5,
        sla_compliance_percent: 94,
        avg_resolution_time_hours: 4.2,
        overdue_tickets: 2,
        sla_breaches: 3,
        tickets_by_priority: getMockPriorityData(),
        open_by_priority: getMockPriorityData()
    };
}

function getMockPriorityData() {
    return [
        { priority: 'Critical', count: 3 },
        { priority: 'High', count: 12 },
        { priority: 'Medium', count: 28 },
        { priority: 'Low', count: 15 }
    ];
}

function getMockCustomerData() {
    return {
        unique_callers_today: 89,
        repeat_callers: 34,
        new_callers: 55,
        repeat_caller_rate_percent: 38.2,
        avg_csat_score: 4.2,
        avg_calls_per_resolution: 1.4,
        csat_distribution: [
            { score: 1, count: 2 },
            { score: 2, count: 5 },
            { score: 3, count: 12 },
            { score: 4, count: 35 },
            { score: 5, count: 46 }
        ],
        top_callers: [
            { caller_name: 'John Smith', caller_phone: '+1234567890', call_count: 8 },
            { caller_name: 'Jane Doe', caller_phone: '+1234567891', call_count: 6 },
            { caller_name: 'Bob Wilson', caller_phone: '+1234567892', call_count: 5 }
        ]
    };
}

function getMockSystemData() {
    return {
        uptime_percent_24h: 99.9,
        uptime_seconds: 864000,
        cpu_usage_percent: 34,
        memory_usage_mb: 512,
        memory_total_mb: 2048,
        disk_usage_percent: 45,
        active_sessions: 3,
        max_sessions: 100,
        api_response_time_ms: 45,
        openai_latency_ms: 230,
        twilio_latency_ms: 120,
        database_latency_ms: 12,
        error_count_5xx: 0,
        error_count_4xx: 5,
        error_rate_percent: 0.02,
        websocket_connections: 2,
        pm2_restarts: 0
    };
}

function getMockCostData() {
    return {
        total_cost_usd: 3.45,
        total_ai_cost_usd: 1.87,
        total_twilio_cost_usd: 1.58,
        cost_per_call_usd: 0.022,
        cost_per_resolution_usd: 0.026,
        total_ai_tokens: 52340,
        total_input_tokens: 18500,
        total_output_tokens: 33840,
        total_audio_tokens: 12500,
        total_twilio_minutes: 482.3,
        total_recording_minutes: 245.1,
        total_api_calls: 456,
        estimated_savings_vs_human_usd: 1560.00,
        first_call_resolution_rate_percent: 78,
        model_usage_breakdown: [
            { model: 'gpt-4o-realtime', tokens: 28000, cost_usd: 1.12 },
            { model: 'gpt-4o-mini', tokens: 24340, cost_usd: 0.75 }
        ]
    };
}

function getMockTrendData() {
    const days = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push({
            date: date.toISOString().split('T')[0],
            total_calls: 100 + Math.floor(Math.random() * 100),
            resolved_calls: 80 + Math.floor(Math.random() * 80)
        });
    }

    return {
        daily_trends: days,
        issue_trends: [
            { issue_category: 'Network Issues', count: 45, trend: 'down' },
            { issue_category: 'Password Reset', count: 38, trend: 'up' },
            { issue_category: 'Device Setup', count: 32, trend: 'stable' },
            { issue_category: 'Email Problems', count: 28, trend: 'down' }
        ],
        common_keywords: [
            { keyword: 'password', frequency: 156 },
            { keyword: 'network', frequency: 98 },
            { keyword: 'email', frequency: 87 },
            { keyword: 'printer', frequency: 65 },
            { keyword: 'VPN', frequency: 54 }
        ],
        sentiment_trends: days.map(d => ({
            date: d.date,
            positive: Math.floor(Math.random() * 50) + 30,
            neutral: Math.floor(Math.random() * 30) + 20,
            negative: Math.floor(Math.random() * 20)
        })),
        knowledge_gaps: [
            { question: 'How to configure multi-factor authentication?', frequency: 12 },
            { question: 'VPN connection timeout issues', frequency: 8 },
            { question: 'SharePoint sync problems', frequency: 6 }
        ]
    };
}

function getMockAgentUsage() {
    return [
        { agent_type: 'triage_agent', count: 156 },
        { agent_type: 'ticket_agent', count: 98 },
        { agent_type: 'network_agent', count: 76 },
        { agent_type: 'device_agent', count: 58 }
    ];
}
