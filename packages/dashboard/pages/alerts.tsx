import React, { useState } from 'react';
import Layout from '../components/layout/Layout';
import AlertHistoryChart from '../components/alert/AlertHistoryChart';

// 模拟告警数据
const mockAlerts = [
    {
        id: 'alert-1',
        name: 'High Actor System CPU Usage',
        description: 'CPU usage exceeded 85% for more than 5 minutes',
        severity: 'critical',
        state: 'firing',
        startsAt: new Date(Date.now() - 2 * 60 * 1000),
        endsAt: null,
        metricName: 'system_cpu_usage',
        metricValue: 87.5,
        labels: {
            host: 'prod-actor-1',
            environment: 'production',
            service: 'actor-system',
        },
    },
    {
        id: 'alert-2',
        name: 'Increased Message Processing Time',
        description: 'Average message processing time increased by 35%',
        severity: 'warning',
        state: 'firing',
        startsAt: new Date(Date.now() - 15 * 60 * 1000),
        endsAt: null,
        metricName: 'actor_message_processing_time',
        metricValue: 250,
        labels: {
            host: 'prod-actor-2',
            environment: 'production',
            service: 'message-processor',
        },
    },
    {
        id: 'alert-3',
        name: 'Low Disk Space',
        description: 'Disk usage exceeded 80% threshold',
        severity: 'warning',
        state: 'firing',
        startsAt: new Date(Date.now() - 45 * 60 * 1000),
        endsAt: null,
        metricName: 'system_disk_usage',
        metricValue: 83.2,
        labels: {
            host: 'prod-actor-3',
            environment: 'production',
            service: 'storage',
        },
    },
    {
        id: 'alert-4',
        name: 'Actor Restart Rate High',
        description: 'Actor restart rate exceeded 5 restarts per minute',
        severity: 'warning',
        state: 'resolved',
        startsAt: new Date(Date.now() - 120 * 60 * 1000),
        endsAt: new Date(Date.now() - 100 * 60 * 1000),
        metricName: 'actor_restart_rate',
        metricValue: 7.2,
        labels: {
            host: 'prod-actor-1',
            environment: 'production',
            service: 'user-actor',
        },
    },
    {
        id: 'alert-5',
        name: 'Network Latency Spike',
        description: 'Network latency exceeded 200ms for more than 1 minute',
        severity: 'error',
        state: 'resolved',
        startsAt: new Date(Date.now() - 240 * 60 * 1000),
        endsAt: new Date(Date.now() - 230 * 60 * 1000),
        metricName: 'network_latency',
        metricValue: 257,
        labels: {
            host: 'prod-actor-2',
            environment: 'production',
            service: 'network',
        },
    },
];

const AlertsPage: React.FC = () => {
    const [showResolved, setShowResolved] = useState(false);
    const [severityFilter, setSeverityFilter] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [historyTimeRange, setHistoryTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
    const [showHistory, setShowHistory] = useState(true);

    // 格式化时间为相对时间
    const formatRelativeTime = (date: Date) => {
        const diffInMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));

        if (diffInMinutes < 1) return 'just now';
        if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;

        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    };

    // 获取告警持续时间
    const getAlertDuration = (alert: typeof mockAlerts[0]) => {
        const end = alert.endsAt || new Date();
        const durationMs = end.getTime() - alert.startsAt.getTime();
        const minutes = Math.floor(durationMs / (1000 * 60));

        if (minutes < 60) return `${minutes}m`;

        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        if (hours < 24) return `${hours}h ${remainingMinutes}m`;

        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;

        return `${days}d ${remainingHours}h`;
    };

    // 过滤告警
    const filteredAlerts = mockAlerts.filter(alert => {
        // 过滤已解决的告警
        if (!showResolved && alert.state === 'resolved') return false;

        // 过滤严重性
        if (severityFilter.length > 0 && !severityFilter.includes(alert.severity)) return false;

        // 搜索过滤
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            return (
                alert.name.toLowerCase().includes(query) ||
                alert.description.toLowerCase().includes(query) ||
                alert.metricName.toLowerCase().includes(query) ||
                Object.values(alert.labels).some(value =>
                    value.toString().toLowerCase().includes(query)
                )
            );
        }

        return true;
    });

    // 分组告警
    const groupedAlerts = filteredAlerts.reduce((acc, alert) => {
        const { severity } = alert;
        if (!acc[severity]) {
            acc[severity] = [];
        }
        acc[severity].push(alert);
        return acc;
    }, {} as Record<string, typeof mockAlerts>);

    // 严重性排序
    const severityOrder = ['critical', 'error', 'warning', 'info'];
    const sortedSeverities = Object.keys(groupedAlerts).sort(
        (a, b) => severityOrder.indexOf(a) - severityOrder.indexOf(b)
    );

    return (
        <Layout title="Alerts - Bagctor Monitoring">
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3 sm:mb-0">Alerts</h1>
                <div className="flex items-center space-x-2">
                    <button
                        className="btn btn-primary"
                        onClick={() => window.location.href = '/alert-rules'}
                    >
                        Manage Alert Rules
                    </button>
                </div>
            </div>

            {/* Alert History Chart */}
            <div className={`card mb-6 ${showHistory ? '' : 'hidden'}`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium">Alert History</h2>
                    <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                            <label htmlFor="show-resolved-history" className="text-sm">
                                Show Resolved
                            </label>
                            <input
                                id="show-resolved-history"
                                type="checkbox"
                                className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                                checked={showResolved}
                                onChange={(e) => setShowResolved(e.target.checked)}
                            />
                        </div>
                        <select
                            className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-8 bg-white dark:bg-gray-800 focus:outline-none focus:ring-primary focus:border-primary"
                            value={historyTimeRange}
                            onChange={(e) => setHistoryTimeRange(e.target.value as '24h' | '7d' | '30d')}
                        >
                            <option value="24h">Last 24 hours</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                        </select>
                        <button
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            onClick={() => setShowHistory(false)}
                        >
                            <svg
                                className="h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
                <div className="h-80">
                    <AlertHistoryChart
                        timeRange={historyTimeRange}
                        showResolved={showResolved}
                        height="100%"
                    />
                </div>
            </div>

            {/* Alert Filter Controls */}
            <div className="card mb-6">
                <div className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                        <div className="mb-4 md:mb-0">
                            <h2 className="text-lg font-medium mb-2">Active Alerts</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {filteredAlerts.length} alerts matching your filters
                            </p>
                        </div>

                        {!showHistory && (
                            <button
                                className="btn btn-outline text-sm mb-4 md:mb-0"
                                onClick={() => setShowHistory(true)}
                            >
                                <svg
                                    className="h-4 w-4 mr-1"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                                    />
                                </svg>
                                Show History Chart
                            </button>
                        )}

                        <div className="flex flex-col space-y-2 md:space-y-0 md:flex-row md:space-x-4">
                            <div className="relative">
                                <input
                                    type="text"
                                    className="border border-gray-300 rounded-md w-full md:w-64 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                    placeholder="Search alerts..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <div className="absolute left-3 top-2.5 text-gray-400">
                                    <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                        <div className="flex items-center">
                            <input
                                id="critical"
                                type="checkbox"
                                className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                                checked={severityFilter.includes('critical')}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSeverityFilter([...severityFilter, 'critical']);
                                    } else {
                                        setSeverityFilter(severityFilter.filter(s => s !== 'critical'));
                                    }
                                }}
                            />
                            <label htmlFor="critical" className="ml-2 text-sm flex items-center">
                                <span className="inline-block w-3 h-3 bg-danger-500 rounded-full mr-1"></span>
                                Critical
                            </label>
                        </div>

                        <div className="flex items-center">
                            <input
                                id="error"
                                type="checkbox"
                                className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                                checked={severityFilter.includes('error')}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSeverityFilter([...severityFilter, 'error']);
                                    } else {
                                        setSeverityFilter(severityFilter.filter(s => s !== 'error'));
                                    }
                                }}
                            />
                            <label htmlFor="error" className="ml-2 text-sm flex items-center">
                                <span className="inline-block w-3 h-3 bg-danger-400 rounded-full mr-1"></span>
                                Error
                            </label>
                        </div>

                        <div className="flex items-center">
                            <input
                                id="warning"
                                type="checkbox"
                                className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                                checked={severityFilter.includes('warning')}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setSeverityFilter([...severityFilter, 'warning']);
                                    } else {
                                        setSeverityFilter(severityFilter.filter(s => s !== 'warning'));
                                    }
                                }}
                            />
                            <label htmlFor="warning" className="ml-2 text-sm flex items-center">
                                <span className="inline-block w-3 h-3 bg-warning-400 rounded-full mr-1"></span>
                                Warning
                            </label>
                        </div>

                        <div className="flex items-center">
                            <input
                                id="show-resolved"
                                type="checkbox"
                                className="h-4 w-4 text-primary border-gray-300 rounded focus:ring-primary"
                                checked={showResolved}
                                onChange={(e) => setShowResolved(e.target.checked)}
                            />
                            <label htmlFor="show-resolved" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                                Show resolved
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Alert List */}
            {filteredAlerts.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden p-6 text-center">
                    <svg
                        className="h-12 w-12 text-gray-400 mx-auto mb-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No alerts found</h3>
                    <p className="text-gray-500 dark:text-gray-400">
                        No alerts match your current filters. Try changing your search or filter settings.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {sortedSeverities.map(severity => (
                        <div key={severity} className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <div className={`px-4 py-3 ${severity === 'critical' ? 'bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300' :
                                severity === 'error' ? 'bg-danger-50 text-danger-600 dark:bg-danger-900/20 dark:text-danger-400' :
                                    severity === 'warning' ? 'bg-warning-50 text-warning-700 dark:bg-warning-900/20 dark:text-warning-300' :
                                        'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
                                }`}>
                                <h2 className="text-lg font-medium capitalize">
                                    {severity} Alerts ({groupedAlerts[severity].length})
                                </h2>
                            </div>
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {groupedAlerts[severity].map(alert => (
                                    <div key={alert.id} className="p-4 hover:bg-gray-50">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-lg font-medium text-gray-900">{alert.name}</h3>
                                            <div className="flex items-center">
                                                <span className={`px-2 py-1 text-xs rounded-full ${alert.state === 'firing' ? 'bg-danger-100 text-danger-800' : 'bg-success-100 text-success-800'
                                                    }`}>
                                                    {alert.state}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="mt-1 text-sm text-gray-600">{alert.description}</p>
                                        <div className="mt-3 flex flex-wrap items-center text-sm text-gray-500 gap-x-4 gap-y-2">
                                            <div>
                                                <span className="font-medium">Started:</span> {formatRelativeTime(alert.startsAt)}
                                            </div>
                                            {alert.endsAt && (
                                                <div>
                                                    <span className="font-medium">Resolved:</span> {formatRelativeTime(alert.endsAt)}
                                                </div>
                                            )}
                                            <div>
                                                <span className="font-medium">Duration:</span> {getAlertDuration(alert)}
                                            </div>
                                            <div>
                                                <span className="font-medium">Metric:</span> {alert.metricName} = {alert.metricValue}
                                            </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {Object.entries(alert.labels).map(([key, value]) => (
                                                <span key={key} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                                    {key}: {value}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Layout>
    );
};

export default AlertsPage; 