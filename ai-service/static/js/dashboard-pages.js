/**
 * U Rack IT Dashboard - Part 2
 * Tickets, Customers, System, Costs, Trends pages
 */

// =====================================================
// TICKETS PAGE
// =====================================================

async function renderTicketsPage(container) {
    let data;
    try {
        data = await fetchData(`${API_BASE}/tickets`);
        data = data.metrics || data;
    } catch (e) {
        console.error('Error fetching tickets:', e);
        data = {};
    }

    container.innerHTML = `
        <div class="fade-in space-y-6">
            <!-- Stats Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                ${renderMetricCard('Created Today', data.tickets_created_today || 0, 'plus', 'primary')}
                ${renderMetricCard('Open', data.open_tickets || 0, 'folder-open', 'blue')}
                ${renderMetricCard('Pending', data.pending_tickets || 0, 'clock', 'yellow')}
                ${renderMetricCard('Resolved', data.resolved_tickets || 0, 'check', 'green')}
                ${renderMetricCard('Escalated', data.escalated_tickets || 0, 'arrow-up', 'orange')}
                ${renderMetricCard('SLA Compliance', (data.sla_compliance_percent || 0) + '%', 'shield', data.sla_compliance_percent >= 90 ? 'green' : 'red')}
            </div>
            
            <!-- Resolution & SLA -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${renderStatCard('Avg Resolution Time', (data.avg_resolution_time_hours || 0).toFixed(1) + 'h', 'Time to close')}
                ${renderStatCard('Overdue Tickets', data.overdue_tickets || 0, 'Past due date')}
                ${renderStatCard('SLA Breaches', data.sla_breaches || 0, 'Missed targets')}
            </div>
            
            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">Tickets by Priority</h3>
                    <div id="ticketsByPriorityChart" class="h-72"></div>
                </div>
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">Open Tickets by Priority</h3>
                    <div id="openTicketsChart" class="h-72"></div>
                </div>
            </div>
            
            <!-- Priority Breakdown -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Priority Breakdown</h3>
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    ${(data.open_by_priority || []).map(p => `
                        <div class="bg-dark-800 rounded-xl p-4">
                            <div class="flex items-center justify-between mb-2">
                                <span class="text-sm text-dark-400">${p.priority}</span>
                                <span class="${getPriorityBadge(p.priority)}">${p.count}</span>
                            </div>
                            <div class="w-full bg-dark-700 rounded-full h-2">
                                <div class="${getPriorityColor(p.priority)} h-2 rounded-full" style="width: ${Math.min(p.count * 10, 100)}%"></div>
                            </div>
                        </div>
                    `).join('') || '<p class="col-span-4 text-dark-400">No data available</p>'}
                </div>
            </div>
        </div>
    `;

    renderTicketsByPriorityChart(data.tickets_by_priority || []);
    renderOpenTicketsChart(data.open_by_priority || []);
}

// =====================================================
// CUSTOMERS PAGE
// =====================================================

async function renderCustomersPage(container) {
    let data;
    try {
        data = await fetchData(`${API_BASE}/customers`);
        data = data.metrics || data;
    } catch (e) {
        console.error('Error fetching customers:', e);
        data = {};
    }

    container.innerHTML = `
        <div class="fade-in space-y-6">
            <!-- Stats Cards -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                ${renderMetricCard('Unique Callers', data.unique_callers_today || 0, 'users', 'primary')}
                ${renderMetricCard('Repeat Callers', data.repeat_callers || 0, 'repeat', 'blue')}
                ${renderMetricCard('New Callers', data.new_callers || 0, 'user-plus', 'green')}
                ${renderMetricCard('Repeat Rate', (data.repeat_caller_rate_percent || 0) + '%', 'refresh', 'purple')}
                ${renderMetricCard('Avg CSAT', (data.avg_csat_score || 0).toFixed(1) + '/5', 'star', 'yellow')}
                ${renderMetricCard('Calls/Resolution', (data.avg_calls_per_resolution || 1).toFixed(1), 'target', 'orange')}
            </div>
            
            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">CSAT Distribution</h3>
                    <div id="csatChart" class="h-72"></div>
                </div>
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">New vs Repeat Callers</h3>
                    <div id="callerTypeChart" class="h-72"></div>
                </div>
            </div>
            
            <!-- Top Callers -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Top 10 Callers</h3>
                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead>
                            <tr class="text-left text-dark-400 text-sm border-b border-dark-700">
                                <th class="pb-3 pr-4">#</th>
                                <th class="pb-3 pr-4">Caller</th>
                                <th class="pb-3 pr-4">Phone</th>
                                <th class="pb-3">Calls</th>
                            </tr>
                        </thead>
                        <tbody class="text-sm">
                            ${(data.top_callers || []).map((c, i) => `
                                <tr class="border-b border-dark-800">
                                    <td class="py-3 pr-4 font-bold text-primary-400">${i + 1}</td>
                                    <td class="py-3 pr-4">${c.caller_name || 'Unknown'}</td>
                                    <td class="py-3 pr-4 text-dark-400">${maskPhone(c.caller_phone)}</td>
                                    <td class="py-3 font-medium">${c.call_count}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="4" class="py-4 text-dark-400 text-center">No data available</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Calls by Organization -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Calls by Organization</h3>
                <div id="orgCallsChart" class="h-72"></div>
            </div>
        </div>
    `;

    renderCSATChart(data.csat_distribution || []);
    renderCallerTypeChart(data.new_callers || 0, data.repeat_callers || 0);
    renderOrgCallsChart(data.calls_by_organization || []);
}

// =====================================================
// SYSTEM HEALTH PAGE
// =====================================================

async function renderSystemPage(container) {
    let data;
    try {
        data = await fetchData(`${API_BASE}/system`);
    } catch (e) {
        console.error('Error fetching system metrics:', e);
        data = {};
    }

    const memoryPercent = data.memory_total_mb ? Math.round((data.memory_usage_mb / data.memory_total_mb) * 100) : 0;
    const sessionPercent = data.max_sessions ? Math.round((data.active_sessions / data.max_sessions) * 100) : 0;

    container.innerHTML = `
        <div class="fade-in space-y-6">
            <!-- Status Banner -->
            <div class="glass rounded-2xl p-6 ${data.uptime_percent_24h >= 99 ? 'border-l-4 border-green-500' : 'border-l-4 border-yellow-500'}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 rounded-full ${data.uptime_percent_24h >= 99 ? 'bg-green-500/20' : 'bg-yellow-500/20'} flex items-center justify-center">
                            <svg class="w-6 h-6 ${data.uptime_percent_24h >= 99 ? 'text-green-500' : 'text-yellow-500'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                            </svg>
                        </div>
                        <div>
                            <h3 class="text-xl font-bold">${data.uptime_percent_24h >= 99 ? 'All Systems Operational' : 'Degraded Performance'}</h3>
                            <p class="text-dark-400">24h Uptime: ${data.uptime_percent_24h || 99.9}%</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-2xl font-bold">${formatUptime(data.uptime_seconds || 0)}</p>
                        <p class="text-sm text-dark-400">Uptime</p>
                    </div>
                </div>
            </div>
            
            <!-- Resource Usage -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${renderGaugeCard('CPU', data.cpu_usage_percent || 0, '%', 'primary')}
                ${renderGaugeCard('Memory', memoryPercent, '%', 'purple', `${data.memory_usage_mb || 0}MB / ${data.memory_total_mb || 0}MB`)}
                ${renderGaugeCard('Disk', data.disk_usage_percent || 0, '%', 'blue')}
                ${renderGaugeCard('Sessions', sessionPercent, '%', 'green', `${data.active_sessions || 0} / ${data.max_sessions || 100}`)}
            </div>
            
            <!-- Latencies -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${renderLatencyCard('API Response', data.api_response_time_ms || 0)}
                ${renderLatencyCard('OpenAI', data.openai_latency_ms || 0)}
                ${renderLatencyCard('Twilio', data.twilio_latency_ms || 0)}
                ${renderLatencyCard('Database', data.database_latency_ms || 0)}
            </div>
            
            <!-- Errors -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${renderStatCard('5xx Errors', data.error_count_5xx || 0, 'Server errors', data.error_count_5xx > 0 ? 'red' : 'green')}
                ${renderStatCard('4xx Errors', data.error_count_4xx || 0, 'Client errors', data.error_count_4xx > 10 ? 'yellow' : 'green')}
                ${renderStatCard('Error Rate', (data.error_rate_percent || 0).toFixed(2) + '%', 'Last hour', data.error_rate_percent > 1 ? 'red' : 'green')}
            </div>
            
            <!-- WebSocket & Sessions -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Connection Status</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="text-center">
                        <p class="text-4xl font-bold text-primary-400">${data.websocket_connections || 0}</p>
                        <p class="text-dark-400 mt-1">WebSocket Connections</p>
                    </div>
                    <div class="text-center">
                        <p class="text-4xl font-bold text-green-400">${data.active_sessions || 0}</p>
                        <p class="text-dark-400 mt-1">Active Sessions</p>
                    </div>
                    <div class="text-center">
                        <p class="text-4xl font-bold text-purple-400">${data.pm2_restarts || 0}</p>
                        <p class="text-dark-400 mt-1">PM2 Restarts</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// =====================================================
// COSTS PAGE
// =====================================================

async function renderCostsPage(container) {
    let data;
    try {
        data = await fetchData(`${API_BASE}/costs`);
        data = data.metrics || data;
    } catch (e) {
        console.error('Error fetching costs:', e);
        data = {};
    }

    container.innerHTML = `
        <div class="fade-in space-y-6">
            <!-- Total Cost Banner -->
            <div class="glass rounded-2xl p-6 bg-gradient-to-r from-primary-600/20 to-purple-600/20 border border-primary-500/30">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="text-dark-400">Total Cost</p>
                        <p class="text-4xl font-bold mt-1">$${(data.total_cost_usd || 0).toFixed(2)}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-green-400 font-semibold">Estimated Savings</p>
                        <p class="text-2xl font-bold text-green-400">$${(data.estimated_savings_vs_human_usd || 0).toFixed(2)}</p>
                        <p class="text-sm text-dark-400">vs human agents</p>
                    </div>
                </div>
            </div>
            
            <!-- Cost Breakdown -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${renderMetricCard('AI Cost', '$' + (data.total_ai_cost_usd || 0).toFixed(2), 'cpu', 'primary')}
                ${renderMetricCard('Twilio Cost', '$' + (data.total_twilio_cost_usd || 0).toFixed(2), 'phone', 'purple')}
                ${renderMetricCard('Cost/Call', '$' + (data.cost_per_call_usd || 0).toFixed(4), 'dollar-sign', 'blue')}
                ${renderMetricCard('Cost/Resolution', '$' + (data.cost_per_resolution_usd || 0).toFixed(4), 'check-circle', 'green')}
            </div>
            
            <!-- Token Usage -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${renderStatCard('Total Tokens', formatNumber(data.total_ai_tokens || 0), 'AI usage')}
                ${renderStatCard('Input Tokens', formatNumber(data.total_input_tokens || 0), 'Prompts')}
                ${renderStatCard('Output Tokens', formatNumber(data.total_output_tokens || 0), 'Responses')}
                ${renderStatCard('Audio Tokens', formatNumber(data.total_audio_tokens || 0), 'Voice processing')}
            </div>
            
            <!-- Twilio Usage -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                ${renderStatCard('Twilio Minutes', (data.total_twilio_minutes || 0).toFixed(1), 'Billable minutes')}
                ${renderStatCard('Recording Minutes', (data.total_recording_minutes || 0).toFixed(1), 'Call recordings')}
                ${renderStatCard('API Calls', formatNumber(data.total_api_calls || 0), 'OpenAI requests')}
            </div>
            
            <!-- Charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">Cost Distribution</h3>
                    <div id="costDistChart" class="h-72"></div>
                </div>
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">Model Usage</h3>
                    <div class="space-y-3">
                        ${(data.model_usage_breakdown || []).map(m => `
                            <div class="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                                <span class="font-medium">${m.model}</span>
                                <div class="text-right">
                                    <p class="font-semibold">${formatNumber(m.tokens || 0)} tokens</p>
                                    <p class="text-sm text-primary-400">$${(m.cost_usd || 0).toFixed(4)}</p>
                                </div>
                            </div>
                        `).join('') || '<p class="text-dark-400">No data available</p>'}
                    </div>
                </div>
            </div>
            
            <!-- FCR -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">First Call Resolution</h3>
                <div class="flex items-center justify-center">
                    <div class="text-center">
                        <p class="text-6xl font-bold text-primary-400">${data.first_call_resolution_rate_percent || 0}%</p>
                        <p class="text-dark-400 mt-2">Issues resolved on first contact</p>
                    </div>
                </div>
            </div>
        </div>
    `;

    renderCostDistributionChart(data.total_ai_cost_usd || 0, data.total_twilio_cost_usd || 0);
}

// =====================================================
// TRENDS PAGE
// =====================================================

async function renderTrendsPage(container) {
    let data;
    try {
        data = await fetchData(`${API_BASE}/trends`, { days: 30 });
    } catch (e) {
        console.error('Error fetching trends:', e);
        data = {};
    }

    container.innerHTML = `
        <div class="fade-in space-y-6">
            <!-- Daily Trends Chart -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Daily Call Volume</h3>
                <div id="dailyTrendChart" class="h-72"></div>
            </div>
            
            <!-- Issue Trends -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">Issue Category Trends</h3>
                    <div class="space-y-3">
                        ${(data.issue_trends || []).map(t => `
                            <div class="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                                <span class="font-medium">${t.issue_category}</span>
                                <div class="flex items-center gap-3">
                                    <span class="font-semibold">${t.count}</span>
                                    <span class="${t.trend === 'up' ? 'text-red-400' : t.trend === 'down' ? 'text-green-400' : 'text-dark-400'}">
                                        ${t.trend === 'up' ? '↑' : t.trend === 'down' ? '↓' : '→'}
                                    </span>
                                </div>
                            </div>
                        `).join('') || '<p class="text-dark-400">No data available</p>'}
                    </div>
                </div>
                
                <div class="glass rounded-2xl p-6">
                    <h3 class="text-lg font-semibold mb-4">Common Keywords</h3>
                    <div class="flex flex-wrap gap-2">
                        ${(data.common_keywords || []).map(k => `
                            <span class="px-3 py-1 bg-primary-600/20 text-primary-400 rounded-full text-sm">
                                ${k.keyword} (${k.frequency})
                            </span>
                        `).join('') || '<p class="text-dark-400">No data available</p>'}
                    </div>
                </div>
            </div>
            
            <!-- Sentiment -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Sentiment Trend</h3>
                <div id="sentimentChart" class="h-72"></div>
            </div>
            
            <!-- Knowledge Gaps -->
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Knowledge Gaps Detected</h3>
                <p class="text-dark-400 mb-4">Questions the AI couldn't fully answer</p>
                <div class="space-y-2">
                    ${(data.knowledge_gaps || []).map((g, i) => `
                        <div class="flex items-center gap-4 p-3 bg-dark-800 rounded-lg">
                            <span class="text-xl font-bold text-orange-400">${i + 1}</span>
                            <span class="flex-1">${g.question}</span>
                            <span class="text-dark-400">${g.frequency}x</span>
                        </div>
                    `).join('') || '<p class="text-dark-400">No knowledge gaps detected</p>'}
                </div>
            </div>
        </div>
    `;

    renderDailyTrendChart(data.daily_trends || []);
    renderSentimentChart(data.sentiment_trends || []);
}

// =====================================================
// SETTINGS PAGE
// =====================================================

function renderSettingsPage(container) {
    container.innerHTML = `
        <div class="fade-in space-y-6">
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">Dashboard Settings</h3>
                <div class="space-y-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="font-medium">Auto-refresh</p>
                            <p class="text-sm text-dark-400">Automatically refresh data every 30 seconds</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked class="sr-only peer">
                            <div class="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-dark-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="font-medium">Dark Mode</p>
                            <p class="text-sm text-dark-400">Use dark theme</p>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked class="sr-only peer">
                            <div class="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-dark-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                    </div>
                </div>
            </div>
            
            <div class="glass rounded-2xl p-6">
                <h3 class="text-lg font-semibold mb-4">About</h3>
                <div class="space-y-2 text-dark-400">
                    <p><strong class="text-white">U Rack IT Analytics Dashboard</strong></p>
                    <p>Version 1.0.0</p>
                    <p>© 2025 U Rack IT. All rights reserved.</p>
                </div>
            </div>
        </div>
    `;
}
