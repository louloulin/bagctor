import React, { useState, useEffect } from 'react';
import Layout from '../components/layout/Layout';
import dynamic from 'next/dynamic';

// 使用dynamic导入ApexCharts，避免服务端渲染错误
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

// 时间范围选项
type TimeRange = '15m' | '1h' | '3h' | '24h';

// Worker模型定义
interface WorkerInfo {
    id: string;
    status: 'active' | 'idle' | 'terminated';
    uptime: number; // 秒
    taskCount: number;
    successCount: number;
    errorCount: number;
    cpuUsage: number;
    memoryUsage: number;
    lastActive: string;
}

// Worker池状态模型
interface WorkerPoolStatus {
    totalWorkers: number;
    activeWorkers: number;
    idleWorkers: number;
    terminatedWorkers: number;
    pendingTasks: number;
    processingTasks: number;
    completedTasks: number;
    failedTasks: number;
    avgProcessingTime: number;
    throughputPerSecond: number;
}

// 任务类型分布
interface TaskTypeDistribution {
    type: string;
    count: number;
    avgProcessingTime: number;
    errorRate: number;
}

// 近期任务
interface RecentTask {
    id: string;
    type: string;
    workerId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    startTime: string;
    endTime?: string;
    duration?: number;
    error?: string;
}

const WorkersPage: React.FC = () => {
    const [timeRange, setTimeRange] = useState<TimeRange>('1h');
    const [workers, setWorkers] = useState<WorkerInfo[]>([]);
    const [poolStatus, setPoolStatus] = useState<WorkerPoolStatus | null>(null);
    const [taskTypes, setTaskTypes] = useState<TaskTypeDistribution[]>([]);
    const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
    const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshInterval, setRefreshInterval] = useState<number | null>(10);

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

    // 格式化持续时间
    const formatDuration = (seconds: number): string => {
        if (seconds < 60) return `${seconds.toFixed(2)}s`;
        if (seconds < 3600) return `${(seconds / 60).toFixed(2)}m`;
        return `${(seconds / 3600).toFixed(2)}h`;
    };

    // 加载数据
    const loadData = async () => {
        setIsLoading(true);
        try {
            // 在实际实现中，这些会是真实的API调用
            // 目前使用模拟数据
            const workersResponse = await fetch(`/api/workers?timeRange=${timeRange}`);
            const workersData = await workersResponse.json();

            setWorkers(workersData.workers || []);
            setPoolStatus(workersData.poolStatus || null);
            setTaskTypes(workersData.taskTypes || []);
            setRecentTasks(workersData.recentTasks || []);
        } catch (error) {
            console.error('Failed to fetch worker data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // 页面加载和时间范围变化时更新数据
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
    }, [timeRange, refreshInterval]);

    // 渲染Worker池概览
    const renderPoolOverview = () => {
        if (!poolStatus) return <div>Loading pool status...</div>;

        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-2">Workers</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-sm text-gray-500">Total</p>
                            <p className="text-2xl font-bold">{poolStatus.totalWorkers}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Active</p>
                            <p className="text-2xl font-bold text-green-500">{poolStatus.activeWorkers}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Idle</p>
                            <p className="text-2xl font-bold text-blue-500">{poolStatus.idleWorkers}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Terminated</p>
                            <p className="text-2xl font-bold text-gray-500">{poolStatus.terminatedWorkers}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-2">Tasks</h3>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-sm text-gray-500">Pending</p>
                            <p className="text-2xl font-bold text-yellow-500">{poolStatus.pendingTasks}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Processing</p>
                            <p className="text-2xl font-bold text-blue-500">{poolStatus.processingTasks}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Completed</p>
                            <p className="text-2xl font-bold text-green-500">{poolStatus.completedTasks}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Failed</p>
                            <p className="text-2xl font-bold text-red-500">{poolStatus.failedTasks}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-2">Performance</h3>
                    <div className="grid grid-cols-1 gap-2">
                        <div>
                            <p className="text-sm text-gray-500">Avg Processing Time</p>
                            <p className="text-2xl font-bold">{poolStatus.avgProcessingTime.toFixed(2)}ms</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Throughput</p>
                            <p className="text-2xl font-bold">{poolStatus.throughputPerSecond.toFixed(2)}/s</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow">
                    <h3 className="text-lg font-semibold mb-2">Health</h3>
                    <div className="relative pt-1">
                        <div className="flex mb-2 items-center justify-between">
                            <div>
                                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">
                                    Pool Utilization
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-semibold inline-block text-green-600">
                                    {Math.round((poolStatus.activeWorkers / poolStatus.totalWorkers) * 100)}%
                                </span>
                            </div>
                        </div>
                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-200">
                            <div style={{ width: `${(poolStatus.activeWorkers / poolStatus.totalWorkers) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"></div>
                        </div>

                        <div className="flex mb-2 items-center justify-between">
                            <div>
                                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-200">
                                    Success Rate
                                </span>
                            </div>
                            <div className="text-right">
                                <span className="text-xs font-semibold inline-block text-blue-600">
                                    {Math.round((poolStatus.completedTasks / (poolStatus.completedTasks + poolStatus.failedTasks || 1)) * 100)}%
                                </span>
                            </div>
                        </div>
                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-200">
                            <div style={{ width: `${(poolStatus.completedTasks / (poolStatus.completedTasks + poolStatus.failedTasks || 1)) * 100}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"></div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // 渲染工作节点列表
    const renderWorkersList = () => {
        if (workers.length === 0) return <div>No workers found</div>;

        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mb-6">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Uptime</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tasks</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Success Rate</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">CPU</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Memory</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Last Active</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {workers.map((worker) => (
                            <tr
                                key={worker.id}
                                className={`hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer ${selectedWorkerId === worker.id ? 'bg-blue-50 dark:bg-blue-900' : ''}`}
                                onClick={() => setSelectedWorkerId(worker.id === selectedWorkerId ? null : worker.id)}
                            >
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{worker.id.substring(0, 8)}...</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                        ${worker.status === 'active' ? 'bg-green-100 text-green-800' :
                                            worker.status === 'idle' ? 'bg-blue-100 text-blue-800' :
                                                'bg-gray-100 text-gray-800'}`}>
                                        {worker.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatDuration(worker.uptime)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{worker.taskCount}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                    {worker.taskCount > 0 ? `${Math.round((worker.successCount / worker.taskCount) * 100)}%` : 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                        <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${worker.cpuUsage}%` }}></div>
                                    </div>
                                    <span className="text-xs">{worker.cpuUsage}%</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                        <div className="bg-purple-600 h-2.5 rounded-full" style={{ width: `${worker.memoryUsage}%` }}></div>
                                    </div>
                                    <span className="text-xs">{worker.memoryUsage}%</span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatRelativeTime(worker.lastActive)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    // 渲染时间范围选择器
    const renderTimeRangeSelector = () => {
        return (
            <div className="flex items-center space-x-2 mb-6">
                <label className="text-sm font-medium text-gray-600 dark:text-gray-300">Time Range:</label>
                <div className="flex rounded-md shadow-sm">
                    {(['15m', '1h', '3h', '24h'] as TimeRange[]).map((range) => (
                        <button
                            key={range}
                            type="button"
                            className={`px-4 py-2 text-sm font-medium ${timeRange === range
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600'
                                } border border-gray-300 dark:border-gray-600 focus:outline-none`}
                            onClick={() => setTimeRange(range)}
                        >
                            {range}
                        </button>
                    ))}
                </div>

                <div className="ml-4 flex items-center">
                    <label className="text-sm font-medium text-gray-600 dark:text-gray-300 mr-2">Refresh:</label>
                    <select
                        className="block w-32 pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-700 dark:text-gray-200"
                        value={refreshInterval?.toString() || 'off'}
                        onChange={(e) => setRefreshInterval(e.target.value === 'off' ? null : parseInt(e.target.value, 10))}
                    >
                        <option value="off">Off</option>
                        <option value="5">5s</option>
                        <option value="10">10s</option>
                        <option value="30">30s</option>
                        <option value="60">1m</option>
                    </select>
                </div>

                <button
                    type="button"
                    className="ml-2 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    onClick={loadData}
                    disabled={isLoading}
                >
                    {isLoading ? 'Loading...' : 'Refresh'}
                </button>
            </div>
        );
    };

    // Update the chart options for dark mode
    const getChartOptions = () => {
        // Check if we're in the browser and dark mode is active
        const isDarkMode = typeof document !== 'undefined' &&
            document.documentElement.classList.contains('dark');

        return {
            chart: {
                type: 'bar' as const,
                height: 350,
                stacked: true,
                toolbar: {
                    show: true
                },
                zoom: {
                    enabled: true
                },
                foreColor: isDarkMode ? '#e2e8f0' : '#374151', // Text color based on theme
                background: isDarkMode ? '#1f2937' : '#ffffff', // Background color based on theme
            },
            responsive: [{
                breakpoint: 480,
                options: {
                    legend: {
                        position: 'bottom' as const,
                        offsetX: -10,
                        offsetY: 0
                    }
                }
            }],
            plotOptions: {
                bar: {
                    horizontal: false,
                    borderRadius: 10
                },
            },
            xaxis: {
                type: 'category' as const,
                categories: taskTypes.map(t => t.type),
                labels: {
                    style: {
                        colors: isDarkMode ? '#e2e8f0' : '#374151',
                    }
                }
            },
            yaxis: {
                labels: {
                    style: {
                        colors: isDarkMode ? '#e2e8f0' : '#374151',
                    }
                }
            },
            legend: {
                position: 'right' as const,
                offsetY: 40,
                labels: {
                    colors: isDarkMode ? '#e2e8f0' : '#374151',
                }
            },
            fill: {
                opacity: 1
            },
            grid: {
                borderColor: isDarkMode ? '#374151' : '#e2e8f0',
            },
            tooltip: {
                theme: isDarkMode ? 'dark' : 'light',
            }
        };
    };

    // 渲染任务类型分布
    const renderTaskTypeDistribution = () => {
        if (!taskTypes || taskTypes.length === 0) return <div className="dark:text-gray-300">No task type data available</div>;

        const chartOptions = getChartOptions();

        const chartSeries = [
            {
                name: 'Task Count',
                data: taskTypes.map(t => t.count)
            },
            {
                name: 'Avg Processing Time (ms)',
                data: taskTypes.map(t => t.avgProcessingTime)
            },
            {
                name: 'Error Rate (%)',
                data: taskTypes.map(t => t.errorRate * 100)
            }
        ];

        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Task Type Distribution</h3>
                <div className="mt-4">
                    {typeof window !== 'undefined' && (
                        <Chart
                            options={chartOptions}
                            series={chartSeries}
                            type="bar"
                            height={350}
                        />
                    )}
                </div>
            </div>
        );
    };

    // 渲染近期任务
    const renderRecentTasks = () => {
        if (!recentTasks || recentTasks.length === 0) return <div>No recent tasks available</div>;

        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-semibold">Recent Tasks</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ID</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Worker</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Started</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Duration</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {recentTasks.map((task) => (
                                <tr key={task.id} className="hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{task.id.substring(0, 8)}...</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{task.type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{task.workerId.substring(0, 8)}...</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                            ${task.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                task.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                                    task.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'}`}>
                                            {task.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">{formatRelativeTime(task.startTime)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                        {task.duration ? `${task.duration.toFixed(2)}ms` : (task.status === 'processing' ? 'In progress' : 'Pending')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <Layout>
            <div className="container mx-auto px-4 py-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Worker Monitoring</h1>
                    {renderTimeRangeSelector()}
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    </div>
                ) : (
                    <>
                        {renderPoolOverview()}
                        {renderWorkersList()}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>{renderTaskTypeDistribution()}</div>
                            <div>{renderRecentTasks()}</div>
                        </div>
                    </>
                )}
            </div>
        </Layout>
    );
};

export default WorkersPage; 