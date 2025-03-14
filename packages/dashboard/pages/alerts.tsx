import React, { useState } from 'react';
import Layout from '../components/layout/Layout';

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
        <Layout title="Alerts - Bagctor Monitoring Dashboard">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
                    <div className="flex items-center space-x-2">
                        <button className="btn btn-primary">
                            + New Alert Rule
                        </button>
                    </div>
                </div>

                {/* 过滤控件 */}
                <div className="bg-white p-4 rounded-lg shadow mb-6">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-[240px]">
                            <label htmlFor="search" className="sr-only">Search alerts</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    id="search"
                                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Search alerts"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="flex items-center space-x-4">
                            <div className="flex items-center">
                                <input
                                    id="critical"
                                    type="checkbox"
                                    className="h-4 w-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
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
                                    className="h-4 w-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
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
                                    className="h-4 w-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
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
                        </div>

                        <div className="flex items-center">
                            <input
                                id="show-resolved"
                                type="checkbox"
                                className="h-4 w-4 text-primary-500 border-gray-300 rounded focus:ring-primary-500"
                                checked={showResolved}
                                onChange={(e) => setShowResolved(e.target.checked)}
                            />
                            <label htmlFor="show-resolved" className="ml-2 text-sm text-gray-700">
                                Show resolved
                            </label>
                        </div>
                    </div>
                </div>

                {/* 告警列表 */}
                {filteredAlerts.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-6 text-center">
                        <svg
                            className="mx-auto h-12 w-12 text-gray-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No alerts</h3>
                        <p className="mt-1 text-sm text-gray-500">No alerts matching your current filters.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {sortedSeverities.map(severity => (
                            <div key={severity} className="bg-white rounded-lg shadow overflow-hidden">
                                <div className={`px-4 py-3 ${severity === 'critical' ? 'bg-danger-50 text-danger-700' :
                                        severity === 'error' ? 'bg-danger-50 text-danger-600' :
                                            severity === 'warning' ? 'bg-warning-50 text-warning-700' :
                                                'bg-primary-50 text-primary-700'
                                    }`}>
                                    <h2 className="text-lg font-medium capitalize">
                                        {severity} Alerts ({groupedAlerts[severity].length})
                                    </h2>
                                </div>
                                <div className="divide-y divide-gray-200">
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
            </div>
        </Layout>
    );
};

export default AlertsPage; 