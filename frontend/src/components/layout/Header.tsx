import type { ReactNode } from 'react';
import { useState } from 'react';
import { RefreshCw, Download, Loader2 } from 'lucide-react';

interface HeaderProps {
    title: string;
    subtitle: string;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    dateRange: string;
    onDateRangeChange: (range: string) => void;
    headerContent?: ReactNode;
}

export function Header({
    title,
    subtitle,
    onRefresh,
    isRefreshing,
    dateRange,
    onDateRangeChange,
    headerContent,
}: HeaderProps) {
    const [exporting, setExporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        try {
            // Export functionality
            const data = { exported_at: new Date().toISOString() };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    return (
        <header className="sticky top-0 z-40 bg-dark-950/85 backdrop-blur-xl border-b border-dark-800">
            <div className="flex items-center justify-between gap-4 px-6 h-16">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="min-w-0">
                        <h1 className="text-lg font-semibold text-dark-50 tracking-tight truncate">
                            {title}
                        </h1>
                        <p className="text-xs text-dark-400 truncate">{subtitle}</p>
                    </div>
                    {headerContent}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Date Range Selector */}
                    <select
                        value={dateRange}
                        onChange={(e) => onDateRangeChange(e.target.value)}
                        aria-label="Date range"
                        className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-1.5 text-sm text-dark-200 hover:border-dark-600 focus:outline-none focus:ring-1 focus:ring-primary-500/60 transition-colors"
                    >
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                    </select>

                    {/* Refresh Button */}
                    <button
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        aria-label="Refresh"
                        className="p-2 rounded-lg border border-dark-700 bg-dark-800 hover:border-dark-600 hover:bg-dark-700 transition-colors disabled:opacity-50"
                    >
                        {isRefreshing ? (
                            <Loader2 className="w-4 h-4 text-dark-300 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4 text-dark-300" />
                        )}
                    </button>

                    {/* Export Button — secondary, neutral so teal stays reserved for data accents */}
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="flex items-center gap-2 px-3 py-1.5 border border-dark-700 bg-dark-800 hover:border-dark-600 hover:bg-dark-700 rounded-lg text-sm font-medium text-dark-100 transition-colors disabled:opacity-50"
                    >
                        <Download className="w-4 h-4 text-dark-300" />
                        Export
                    </button>
                </div>
            </div>
        </header>
    );
}
