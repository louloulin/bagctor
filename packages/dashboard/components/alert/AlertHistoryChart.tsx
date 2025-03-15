import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '../../contexts/ThemeContext';

// 使用dynamic导入ApexCharts，避免服务端渲染错误
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface AlertHistoryData {
    timestamp: string;
    critical: number;
    error: number;
    warning: number;
    info: number;
    resolved: number;
}

interface AlertHistoryChartProps {
    data?: AlertHistoryData[];
    timeRange?: '24h' | '7d' | '30d';
    showResolved?: boolean;
    height?: number | string;
}

// 模拟数据生成
const generateMockData = (days: number): AlertHistoryData[] => {
    const data: AlertHistoryData[] = [];
    const now = new Date();

    for (let i = days; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        // 生成随机数据点，但保持一定的趋势
        const critical = Math.floor(Math.random() * 5);
        const error = Math.floor(Math.random() * 8);
        const warning = Math.floor(Math.random() * 12);
        const info = Math.floor(Math.random() * 15);
        const resolved = Math.floor(Math.random() * (critical + error + warning + info) * 0.8);

        data.push({
            timestamp: date.toISOString().split('T')[0],
            critical,
            error,
            warning,
            info,
            resolved
        });
    }

    return data;
};

const AlertHistoryChart: React.FC<AlertHistoryChartProps> = ({
    data,
    timeRange = '7d',
    showResolved = true,
    height = 350
}) => {
    const [chartData, setChartData] = useState<AlertHistoryData[]>([]);
    const { theme } = useTheme();
    const isDarkMode = theme === 'dark';

    useEffect(() => {
        // 如果没有提供数据，生成模拟数据
        if (!data) {
            const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30;
            setChartData(generateMockData(days));
        } else {
            setChartData(data);
        }
    }, [data, timeRange]);

    const series = [
        {
            name: 'Critical',
            data: chartData.map(item => item.critical)
        },
        {
            name: 'Error',
            data: chartData.map(item => item.error)
        },
        {
            name: 'Warning',
            data: chartData.map(item => item.warning)
        },
        {
            name: 'Info',
            data: chartData.map(item => item.info)
        }
    ];

    if (showResolved) {
        series.push({
            name: 'Resolved',
            data: chartData.map(item => item.resolved)
        });
    }

    const options = {
        chart: {
            type: 'bar',
            stacked: true,
            toolbar: {
                show: true,
                tools: {
                    download: true,
                    selection: false,
                    zoom: false,
                    zoomin: false,
                    zoomout: false,
                    pan: false,
                    reset: false
                }
            },
            animations: {
                enabled: true
            },
            background: 'transparent'
        },
        plotOptions: {
            bar: {
                horizontal: false,
                columnWidth: '60%'
            }
        },
        dataLabels: {
            enabled: false
        },
        colors: ['#ef4444', '#f97316', '#f59e0b', '#3b82f6', '#22c55e'],
        xaxis: {
            categories: chartData.map(item => item.timestamp),
            labels: {
                style: {
                    colors: isDarkMode ? '#cbd5e1' : '#64748b',
                    fontSize: '12px'
                }
            },
            axisBorder: {
                show: false
            },
            axisTicks: {
                show: false
            }
        },
        yaxis: {
            labels: {
                style: {
                    colors: isDarkMode ? '#cbd5e1' : '#64748b',
                    fontSize: '12px'
                }
            }
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            offsetY: -8,
            fontSize: '13px',
            labels: {
                colors: isDarkMode ? '#e2e8f0' : '#1e293b'
            },
            markers: {
                width: 12,
                height: 12,
                radius: 6
            },
            itemMargin: {
                horizontal: 10
            }
        },
        fill: {
            opacity: 1
        },
        grid: {
            borderColor: isDarkMode ? '#334155' : '#e2e8f0',
            strokeDashArray: 4,
            padding: {
                left: 0,
                right: 0
            }
        },
        tooltip: {
            theme: isDarkMode ? 'dark' : 'light',
            y: {
                formatter: (value: number) => `${value} alerts`
            }
        }
    };

    return (
        <div className="w-full h-full">
            <Chart
                options={options as ApexCharts.ApexOptions}
                series={series}
                type="bar"
                height={height}
            />
        </div>
    );
};

export default AlertHistoryChart; 