import React from 'react';
import dynamic from 'next/dynamic';

// 使用dynamic导入ApexCharts，避免服务端渲染错误
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const SystemMetricsChart: React.FC = () => {
    // 模拟数据
    const series = [
        {
            name: 'CPU Usage',
            data: [42, 45, 38, 56, 45, 48, 50, 41, 52, 46, 45, 54],
        },
        {
            name: 'Memory Usage',
            data: [64, 63, 62, 65, 68, 69, 72, 73, 70, 72, 75, 74],
        },
        {
            name: 'Disk I/O',
            data: [28, 32, 25, 33, 30, 28, 35, 27, 28, 32, 29, 30],
        },
    ];

    // 图表配置
    const options = {
        chart: {
            type: 'line',
            height: 350,
            toolbar: {
                show: false,
            },
            zoom: {
                enabled: false,
            },
        },
        dataLabels: {
            enabled: false,
        },
        stroke: {
            curve: 'smooth',
            width: 2,
        },
        colors: ['#0ea5e9', '#f59e0b', '#22c55e'],
        xaxis: {
            categories: ['12:00', '12:05', '12:10', '12:15', '12:20', '12:25', '12:30', '12:35', '12:40', '12:45', '12:50', '12:55'],
            labels: {
                style: {
                    colors: '#64748b',
                    fontSize: '12px',
                },
            },
            axisBorder: {
                show: false,
            },
        },
        yaxis: {
            min: 0,
            max: 100,
            labels: {
                style: {
                    colors: '#64748b',
                    fontSize: '12px',
                },
                formatter: (value: number) => `${value}%`,
            },
        },
        tooltip: {
            y: {
                formatter: (value: number) => `${value}%`,
            },
        },
        grid: {
            borderColor: '#e2e8f0',
            strokeDashArray: 4,
            padding: {
                left: 0,
                right: 0,
            },
        },
        legend: {
            position: 'top',
            horizontalAlign: 'right',
            offsetY: -8,
            fontSize: '13px',
            fontFamily: 'Inter, sans-serif',
            markers: {
                width: 10,
                height: 10,
                radius: 12,
            },
            itemMargin: {
                horizontal: 10,
            },
        },
    };

    return (
        <div className="w-full h-80">
            <Chart
                options={options as ApexCharts.ApexOptions}
                series={series}
                type="line"
                height="100%"
            />
        </div>
    );
};

export default SystemMetricsChart; 