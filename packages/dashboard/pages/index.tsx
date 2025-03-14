import React, { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { AlertSeverity, AlertState } from './api/alerts';

// 使用dynamic导入ApexCharts，避免服务端渲染错误
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// 模拟接口定义
interface Alert {
    id: string;
    name: string;
    severity: AlertSeverity;
    state: AlertState;
    startsAt: string;
}

interface ActorTypeDistribution {
    type: string;
    count: number;
    status: {
        active: number;
        idle: number;
        stopped: number;
        restarting: number;
    };
}

interface SystemOverview {
    totalActors: number;
    activeActors: number;
    messageRate: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
}

const Dashboard: React.FC = () => {
    const [systemOverview, setSystemOverview] = useState<SystemOverview | null>(null);
    const [actorTypes, setActorTypes] = useState<ActorTypeDistribution[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState<number | null>(30);

    // 格式化时间为相对时间
    const formatRelativeTime = (dateString: string): string => {
        const date = new Date(dateString);
        const now = new Date();
        const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffSeconds < 60) return `${diffSeconds}s ago`;
        if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
        if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
        return `${Math.floor(diffSeconds / 86400)}d ago`;
    };

    // 格式化时间为分:秒显示
    const formatUptime = (minutes: number): string => {
        const days = Math.floor(minutes / 1440);
        const hours = Math.floor((minutes % 1440) / 60);
        const mins = minutes % 60;

        if (days > 0) return `${days}d ${hours}h ${mins}m`;
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    // 加载数据
    const loadData = async () => {
        setIsLoading(true);
        try {
            // 获取Actor数据
            const actorResponse = await fetch('/api/actors');
            const actorData = await actorResponse.json();
            setSystemOverview(actorData.overview);
            setActorTypes(actorData.actorTypes);

            // 获取告警数据
            const alertsResponse = await fetch('/api/alerts');
            const alertsData = await alertsResponse.json();
            setAlerts(alertsData.alerts.slice(0, 5)); // 只显示前5个告警
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // 页面加载时获取数据
    useEffect(() => {
        loadData();

        // 设置定时刷新
        let intervalId: NodeJS.Timeout | null = null;

        if (refreshInterval) {
            intervalId = setInterval(() => {
                loadData();
            }, refreshInterval * 1000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [refreshInterval]);

    // 获取告警颜色
    const getAlertColor = (severity: AlertSeverity): string => {
        switch (severity) {
            case AlertSeverity.Critical:
                return 'text-red-600 bg-red-100';
            case AlertSeverity.High:
                return 'text-orange-600 bg-orange-100';
            case AlertSeverity.Medium:
                return 'text-amber-600 bg-amber-100';
            case AlertSeverity.Low:
                return 'text-blue-600 bg-blue-100';
            case AlertSeverity.Info:
            default:
                return 'text-gray-600 bg-gray-100';
        }
    };

    return (
        <Layout title="Dashboard - Bagctor Monitoring">
            <div className="mb-5 flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">System Dashboard</h1>
                <div className="flex items-center space-x-2">
                    <div className="flex items-center">
                        <span className="text-sm text-gray-600 mr-2">Refresh:</span>
                        <select
                            className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-8 bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                            value={refreshInterval?.toString() || 'off'}
                            onChange={(e) => {
                                const value = e.target.value;
                                setRefreshInterval(value === 'off' ? null : parseInt(value, 10));
                            }}
                        >
                            <option value="off">Off</option>
                            <option value="10">10s</option>
                            <option value="30">30s</option>
                            <option value="60">1m</option>
                            <option value="300">5m</option>
                        </select>
                    </div>
                    <button
                        className="btn btn-primary flex items-center"
                        onClick={() => loadData()}
                        disabled={isLoading}
                    >
                        <svg
                            className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        Refresh Now
                    </button>
                </div>
            </div>

            {/* 系统概览卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
                <div className="card">
                    <h2 className="text-base text-gray-600 mb-1">Actors</h2>
                    <div className="flex items-center">
                        <div className="text-3xl font-bold">
                            {systemOverview ? systemOverview.activeActors : '...'}
                            <span className="text-base font-normal text-gray-500 ml-1">/ {systemOverview ? systemOverview.totalActors : '...'}</span>
                        </div>
                        <div className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5 ml-2">
                            {systemOverview ? Math.round((systemOverview.activeActors / systemOverview.totalActors) * 100) : '...'}%
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Active Actors</p>
                </div>

                <div className="card">
                    <h2 className="text-base text-gray-600 mb-1">Message Rate</h2>
                    <div className="flex items-center">
                        <div className="text-3xl font-bold">
                            {systemOverview ? systemOverview.messageRate : '...'}
                        </div>
                        <div className="text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 ml-2">
                            msgs/sec
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Current throughput</p>
                </div>

                <div className="card">
                    <h2 className="text-base text-gray-600 mb-1">Error Rate</h2>
                    <div className="flex items-center">
                        <div className="text-3xl font-bold">
                            {systemOverview ? (systemOverview.errorRate * 100).toFixed(2) : '...'}%
                        </div>
                        <div className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5 ml-2">
                            {systemOverview && systemOverview.errorRate < 0.01 ? 'normal' : 'high'}
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Message processing errors</p>
                </div>

                <div className="card">
                    <h2 className="text-base text-gray-600 mb-1">System Usage</h2>
                    <div className="flex items-center">
                        <div className="text-3xl font-bold">
                            {systemOverview ? systemOverview.cpuUsage : '...'}%
                        </div>
                        <div className="text-xs bg-purple-100 text-purple-800 rounded-full px-2 py-0.5 ml-2">
                            CPU
                        </div>
                        <div className="text-xs bg-indigo-100 text-indigo-800 rounded-full px-2 py-0.5 ml-1">
                            {systemOverview ? systemOverview.memoryUsage : '...'}% MEM
                        </div>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                        Uptime: {systemOverview ? formatUptime(systemOverview.uptime) : '...'}
                    </p>
                </div>
            </div>

            {/* 主要内容区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* 消息速率图表 */}
                <div className="lg:col-span-2 card">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium">Message Rate</h2>
                        <Link href="/metrics" className="text-sm text-blue-600 hover:text-blue-800">
                            View Details →
                        </Link>
                    </div>
                    <div className="h-80">
                        {!isLoading && (
                            <Chart
                                options={{
                                    chart: {
                                        type: 'area',
                                        toolbar: { show: false },
                                        zoom: { enabled: false },
                                    },
                                    stroke: { curve: 'smooth', width: 2 },
                                    fill: {
                                        type: 'gradient',
                                        gradient: {
                                            shadeIntensity: 1,
                                            opacityFrom: 0.4,
                                            opacityTo: 0.1,
                                        },
                                    },
                                    colors: ['#0284c7', '#6366f1'],
                                    xaxis: {
                                        categories: ['12:00', '12:05', '12:10', '12:15', '12:20', '12:25', '12:30', '12:35', '12:40', '12:45', '12:50', '12:55'],
                                        labels: { style: { colors: '#64748b', fontSize: '12px' } },
                                    },
                                    yaxis: {
                                        labels: {
                                            style: { colors: '#64748b', fontSize: '12px' },
                                            formatter: (value: number) => `${value} msgs/sec`,
                                        },
                                    },
                                    legend: {
                                        position: 'top',
                                        horizontalAlign: 'right',
                                        fontSize: '13px',
                                    },
                                    tooltip: {
                                        y: {
                                            formatter: (value: number) => `${value} msgs/sec`
                                        }
                                    }
                                } as any}
                                series={[
                                    {
                                        name: 'Sent',
                                        data: [480, 525, 570, 620, 650, 690, 640, 680, 720, 755, 790, 830]
                                    },
                                    {
                                        name: 'Received',
                                        data: [470, 515, 560, 610, 645, 680, 630, 670, 710, 745, 775, 820]
                                    },
                                ]}
                                type="area"
                                height="100%"
                            />
                        )}
                    </div>
                </div>

                {/* 告警面板 */}
                <div className="card">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium">Active Alerts</h2>
                        <Link href="/alerts" className="text-sm text-blue-600 hover:text-blue-800">
                            View All →
                        </Link>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center items-center h-80">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                        </div>
                    ) : alerts.length > 0 ? (
                        <div className="space-y-3">
                            {alerts.map(alert => (
                                <div key={alert.id} className="border border-gray-200 rounded-md p-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-medium">{alert.name}</div>
                                            <div className="text-sm text-gray-500">
                                                {formatRelativeTime(alert.startsAt)}
                                            </div>
                                        </div>
                                        <div className={`px-2 py-1 rounded-md text-xs font-medium ${getAlertColor(alert.severity)}`}>
                                            {alert.severity}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="text-center pt-2">
                                <Link href="/alerts" className="text-sm text-blue-600 hover:text-blue-800">
                                    View All Alerts
                                </Link>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col justify-center items-center h-80 text-gray-500">
                            <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p>No active alerts</p>
                            <p className="text-sm">Everything is running smoothly</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Actor分布 */}
            <div className="card mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-medium">Actor Distribution</h2>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center h-80">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full bg-white">
                            <thead>
                                <tr className="bg-gray-100 border-b">
                                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Actor Type</th>
                                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Count</th>
                                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Active</th>
                                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Idle</th>
                                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Restarting</th>
                                    <th className="py-3 px-4 text-left text-sm font-medium text-gray-700">Stopped</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actorTypes.map((actor, index) => (
                                    <tr key={actor.type} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                        <td className="py-3 px-4 text-sm text-gray-800 font-medium">{actor.type}</td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{actor.count}</td>
                                        <td className="py-3 px-4 text-sm">
                                            <span className="text-green-600 font-medium">{actor.status.active}</span>
                                            <span className="text-gray-500"> ({Math.round((actor.status.active / actor.count) * 100)}%)</span>
                                        </td>
                                        <td className="py-3 px-4 text-sm text-gray-800">{actor.status.idle}</td>
                                        <td className="py-3 px-4 text-sm">
                                            {actor.status.restarting > 0 ? (
                                                <span className="text-orange-600">{actor.status.restarting}</span>
                                            ) : (
                                                <span className="text-gray-800">0</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-sm">
                                            {actor.status.stopped > 0 ? (
                                                <span className="text-red-600">{actor.status.stopped}</span>
                                            ) : (
                                                <span className="text-gray-800">0</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Layout>
    );
};

export default Dashboard; 