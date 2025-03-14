import React, { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import dynamic from 'next/dynamic';

// 使用dynamic导入ApexCharts，避免服务端渲染错误
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// 指标类别
type MetricCategory = 'system' | 'actors' | 'messages';

// 时间范围选项
type TimeRange = '15m' | '1h' | '3h' | '24h';

const MetricsPage: React.FC = () => {
    const [metrics, setMetrics] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<TimeRange>('1h');
    const [category, setCategory] = useState<MetricCategory>('system');
    const [refreshInterval, setRefreshInterval] = useState<number | null>(30);

    // 加载指标数据
    const loadMetrics = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/metrics?timeRange=${timeRange}`);
            const data = await response.json();
            setMetrics(data);
        } catch (error) {
            console.error('Failed to fetch metrics:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // 页面加载和时间范围变化时更新数据
    useEffect(() => {
        loadMetrics();

        // 设置定时刷新
        let intervalId: NodeJS.Timeout | null = null;

        if (refreshInterval) {
            intervalId = setInterval(() => {
                loadMetrics();
            }, refreshInterval * 1000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [timeRange, refreshInterval]);

    // 渲染指标图表
    const renderCharts = () => {
        if (!metrics) return null;

        // 系统指标
        if (category === 'system') {
            return (
                <>
                    <div className="card mb-6">
                        <h2 className="text-lg font-medium mb-4">CPU Usage</h2>
                        <div className="h-80">
                            <Chart
                                options={{
                                    chart: {
                                        type: 'line',
                                        toolbar: { show: false },
                                        zoom: { enabled: false },
                                    },
                                    stroke: { curve: 'smooth', width: 2 },
                                    colors: ['#0284c7'],
                                    xaxis: {
                                        categories: metrics.timeLabels,
                                        labels: { style: { colors: '#64748b', fontSize: '12px' } },
                                    },
                                    yaxis: {
                                        labels: {
                                            style: { colors: '#64748b', fontSize: '12px' },
                                            formatter: (value: number) => `${value}%`,
                                        },
                                        max: 100,
                                    },
                                    tooltip: {
                                        y: {
                                            formatter: (value: number) => `${value}%`
                                        }
                                    }
                                } as any}
                                series={[
                                    {
                                        name: 'CPU Usage',
                                        data: metrics.system.cpu
                                    }
                                ]}
                                type="line"
                                height="100%"
                            />
                        </div>
                    </div>

                    <div className="card mb-6">
                        <h2 className="text-lg font-medium mb-4">Memory Usage</h2>
                        <div className="h-80">
                            <Chart
                                options={{
                                    chart: {
                                        type: 'line',
                                        toolbar: { show: false },
                                        zoom: { enabled: false },
                                    },
                                    stroke: { curve: 'smooth', width: 2 },
                                    colors: ['#6366f1'],
                                    xaxis: {
                                        categories: metrics.timeLabels,
                                        labels: { style: { colors: '#64748b', fontSize: '12px' } },
                                    },
                                    yaxis: {
                                        labels: {
                                            style: { colors: '#64748b', fontSize: '12px' },
                                            formatter: (value: number) => `${value}%`,
                                        },
                                        max: 100,
                                    },
                                    tooltip: {
                                        y: {
                                            formatter: (value: number) => `${value}%`
                                        }
                                    }
                                } as any}
                                series={[
                                    {
                                        name: 'Memory Usage',
                                        data: metrics.system.memory
                                    }
                                ]}
                                type="line"
                                height="100%"
                            />
                        </div>
                    </div>
                </>
            );
        }

        // Actor指标
        if (category === 'actors') {
            return (
                <div className="card mb-6">
                    <h2 className="text-lg font-medium mb-4">Active Actors</h2>
                    <div className="h-80">
                        <Chart
                            options={{
                                chart: {
                                    type: 'line',
                                    toolbar: { show: false },
                                    zoom: { enabled: false },
                                },
                                stroke: { curve: 'smooth', width: 2 },
                                colors: ['#10b981'],
                                xaxis: {
                                    categories: metrics.timeLabels,
                                    labels: { style: { colors: '#64748b', fontSize: '12px' } },
                                },
                                yaxis: {
                                    labels: {
                                        style: { colors: '#64748b', fontSize: '12px' },
                                    },
                                },
                            } as any}
                            series={[
                                {
                                    name: 'Active Actors',
                                    data: metrics.actors.active
                                }
                            ]}
                            type="line"
                            height="100%"
                        />
                    </div>
                </div>
            );
        }

        // 消息指标
        return (
            <>
                <div className="card mb-6">
                    <h2 className="text-lg font-medium mb-4">Message Rate</h2>
                    <div className="h-80">
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
                                    categories: metrics.timeLabels,
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
                                    data: metrics.messages.sent
                                },
                                {
                                    name: 'Received',
                                    data: metrics.messages.received
                                },
                            ]}
                            type="area"
                            height="100%"
                        />
                    </div>
                </div>

                <div className="card mb-6">
                    <h2 className="text-lg font-medium mb-4">Error Rate</h2>
                    <div className="h-80">
                        <Chart
                            options={{
                                chart: {
                                    type: 'line',
                                    toolbar: { show: false },
                                    zoom: { enabled: false },
                                },
                                stroke: { curve: 'smooth', width: 2 },
                                colors: ['#ef4444'],
                                xaxis: {
                                    categories: metrics.timeLabels,
                                    labels: { style: { colors: '#64748b', fontSize: '12px' } },
                                },
                                yaxis: {
                                    labels: {
                                        style: { colors: '#64748b', fontSize: '12px' },
                                        formatter: (value: number) => `${value}%`,
                                    },
                                },
                                tooltip: {
                                    y: {
                                        formatter: (value: number) => `${value}%`
                                    }
                                }
                            } as any}
                            series={[
                                {
                                    name: 'Error Rate',
                                    data: metrics.messages.errorRate
                                }
                            ]}
                            type="line"
                            height="100%"
                        />
                    </div>
                </div>
            </>
        );
    };

    return (
        <Layout title="Metrics - Bagctor Monitoring">
            <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold text-gray-900 mb-3 sm:mb-0">System Metrics</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center">
                        <span className="text-sm text-gray-600 mr-2">Time Range:</span>
                        <select
                            className="border border-gray-300 rounded-md text-sm py-1 pl-2 pr-8 bg-white focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                            value={timeRange}
                            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                        >
                            <option value="15m">Last 15 minutes</option>
                            <option value="1h">Last 1 hour</option>
                            <option value="3h">Last 3 hours</option>
                            <option value="24h">Last 24 hours</option>
                        </select>
                    </div>
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
                        </select>
                    </div>
                    <button
                        className="btn btn-primary flex items-center"
                        onClick={() => loadMetrics()}
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
                        Refresh
                    </button>
                </div>
            </div>

            <div className="mb-6">
                <div className="flex border-b border-gray-200">
                    <button
                        className={`px-4 py-2 font-medium text-sm ${category === 'system'
                                ? 'text-primary-600 border-b-2 border-primary-500'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                        onClick={() => setCategory('system')}
                    >
                        System
                    </button>
                    <button
                        className={`px-4 py-2 font-medium text-sm ${category === 'actors'
                                ? 'text-primary-600 border-b-2 border-primary-500'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                        onClick={() => setCategory('actors')}
                    >
                        Actors
                    </button>
                    <button
                        className={`px-4 py-2 font-medium text-sm ${category === 'messages'
                                ? 'text-primary-600 border-b-2 border-primary-500'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                        onClick={() => setCategory('messages')}
                    >
                        Messages
                    </button>
                </div>
            </div>

            {isLoading && !metrics ? (
                <div className="flex justify-center items-center h-80">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                </div>
            ) : (
                renderCharts()
            )}
        </Layout>
    );
};

export default MetricsPage; 