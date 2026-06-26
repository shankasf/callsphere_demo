import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '../components/layout';
import { MetricCard, Card, EmptyState, LoadingSpinner } from '../components/common';
import {
    Shield,
    Lock,
    AlertTriangle,
    CheckCircle,
    RefreshCw,
} from 'lucide-react';
import clsx from 'clsx';
import { dashboardApi } from '../services/api';

export function CompliancePage() {
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    // Fetch compliance metrics from API
    const fetchData = useCallback(async () => {
        try {
            const response = await dashboardApi.getComplianceMetrics();
            if (response) {
                setData(response);
                setLastRefresh(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch compliance metrics:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial fetch and periodic refresh
    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60000);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (isLoading) {
        return (
            <DashboardLayout
                title="Compliance & Security"
                subtitle="Regulatory compliance, security monitoring, and risk assessment"
            >
                <div className="flex items-center justify-center h-96">
                    <LoadingSpinner size="lg" />
                </div>
            </DashboardLayout>
        );
    }

    const compliance = data?.compliance || {};
    const security = data?.security || {};
    const risk = data?.risk || {};

    const avgCompliance = compliance.recordingConsent ?? 0;

    return (
        <DashboardLayout
            title="Compliance & Security"
            subtitle="Regulatory compliance, security monitoring, and risk assessment"
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
                        label="Recording Consent"
                        value={avgCompliance > 0 ? `${avgCompliance.toFixed(0)}%` : '—'}
                        icon="shield"
                        color={avgCompliance >= 95 ? 'green' : avgCompliance >= 85 ? 'yellow' : 'gray'}
                    />
                    <MetricCard
                        label="PII Detection"
                        value={compliance.piiDetectionRate !== null ? `${compliance.piiDetectionRate?.toFixed(0)}%` : '—'}
                        icon="eye"
                        color="blue"
                    />
                    <MetricCard
                        label="Auth Success"
                        value={security.authSuccessRate !== null ? `${security.authSuccessRate?.toFixed(1)}%` : '—'}
                        icon="check"
                        color="green"
                    />
                    <MetricCard
                        label="Failed Auth"
                        value={security.failedAuthAttempts ?? '—'}
                        icon="alert-triangle"
                        color={security.failedAuthAttempts > 30 ? 'red' : 'yellow'}
                    />
                    <MetricCard
                        label="Risk Score"
                        value={risk.overallRiskScore ?? '—'}
                        icon="activity"
                        color={risk.overallRiskScore !== null ? (risk.overallRiskScore <= 20 ? 'green' : risk.overallRiskScore <= 40 ? 'yellow' : 'red') : 'gray'}
                    />
                    <MetricCard
                        label="Encryption"
                        value={security.encryptionCompliance !== null ? `${security.encryptionCompliance}%` : '—'}
                        icon="lock"
                        color="green"
                    />
                </div>

                {/* Compliance Summary */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card title="Compliance Overview">
                        {avgCompliance > 0 ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-dark-800 rounded-xl text-center">
                                        <p className="text-2xl font-bold text-green-400">
                                            {compliance.recordingConsent?.toFixed(0) || '—'}%
                                        </p>
                                        <p className="text-sm text-dark-400">Recording Consent</p>
                                    </div>
                                    <div className="p-4 bg-dark-800 rounded-xl text-center">
                                        <p className="text-2xl font-bold text-blue-400">
                                            {compliance.gdprCompliance?.toFixed(0) || '—'}%
                                        </p>
                                        <p className="text-sm text-dark-400">GDPR</p>
                                    </div>
                                    <div className="p-4 bg-dark-800 rounded-xl text-center">
                                        <p className="text-2xl font-bold text-purple-400">
                                            {compliance.pciDssCompliance?.toFixed(0) || '—'}%
                                        </p>
                                        <p className="text-sm text-dark-400">PCI-DSS</p>
                                    </div>
                                    <div className="p-4 bg-dark-800 rounded-xl text-center">
                                        <p className="text-2xl font-bold text-cyan-400">
                                            {compliance.hipaaCompliance?.toFixed(0) || '—'}%
                                        </p>
                                        <p className="text-sm text-dark-400">HIPAA</p>
                                    </div>
                                </div>

                                {compliance.complianceViolations && compliance.complianceViolations.length > 0 && (
                                    <div>
                                        <p className="text-sm text-dark-400 mb-2">Recent Violations</p>
                                        <div className="space-y-2">
                                            {compliance.complianceViolations.map((v: any, i: number) => (
                                                <div key={i} className={clsx(
                                                    'flex items-center justify-between p-2 rounded-lg',
                                                    v.severity === 'high' ? 'bg-red-600/20' : 'bg-yellow-600/20'
                                                )}>
                                                    <span className="text-sm">{v.type}</span>
                                                    <span className={clsx(
                                                        'text-sm font-semibold',
                                                        v.severity === 'high' ? 'text-red-400' : 'text-yellow-400'
                                                    )}>{v.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <EmptyState
                                message="No compliance data available. Data will appear once calls are processed."
                                icon={<Shield className="w-12 h-12 text-dark-500" />}
                            />
                        )}
                    </Card>

                    <Card title="Security Overview">
                        {security.encryptionCompliance !== null ? (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-dark-800 rounded-xl text-center">
                                        <Lock className="w-8 h-8 text-green-400 mx-auto mb-2" />
                                        <p className="text-lg font-bold text-green-400">
                                            {security.encryptionCompliance}%
                                        </p>
                                        <p className="text-xs text-dark-400">Encryption</p>
                                    </div>
                                    <div className="p-4 bg-dark-800 rounded-xl text-center">
                                        <CheckCircle className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                                        <p className="text-lg font-bold text-blue-400">
                                            {security.accessLogIntegrity || '—'}%
                                        </p>
                                        <p className="text-xs text-dark-400">Log Integrity</p>
                                    </div>
                                </div>

                                {security.recentSecurityEvents && security.recentSecurityEvents.length > 0 && (
                                    <div>
                                        <p className="text-sm text-dark-400 mb-2">Recent Events</p>
                                        <div className="space-y-2">
                                            {security.recentSecurityEvents.map((event: any, i: number) => (
                                                <div key={i} className="flex items-center gap-3 p-2 bg-dark-800 rounded-lg text-sm">
                                                    <AlertTriangle className={clsx(
                                                        'w-4 h-4',
                                                        event.severity === 'warning' ? 'text-yellow-400' : 'text-blue-400'
                                                    )} />
                                                    <span className="flex-1 text-dark-300">{event.event}</span>
                                                    <span className="text-dark-500 text-xs">{event.time}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <EmptyState
                                message="No security data available."
                                icon={<Lock className="w-12 h-12 text-dark-500" />}
                            />
                        )}
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
