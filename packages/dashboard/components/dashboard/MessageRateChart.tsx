import React from 'react';
import dynamic from 'next/dynamic';

// 使用dynamic导入ApexCharts，避免服务端渲染错误
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

const MessageRateChart: React.FC = () => {
    // 模拟消息处理数据
    const series = [
        {
            name: 'Messages Sent',
            data: [320, 380, 452, 410, 435, 510, 484, 542, 586, 670, 624, 705],
        },
        {
            name: 'Messages Received',
            data: [310, 368, 440, 405, 429, 498, 475, 535, 578, 655, 610, 695],
        },
    ];

    // 图表配置
    const options = {
        chart: {
            type: 'area',
            height: 350,
            stacked: false,
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
        fill: {
            type: 'gradient',
            gradient: {
                shadeIntensity: 1,
                opacityFrom: 0.4,
                opacityTo: 0.1,
                stops: [0, 90, 100],
            },
        },
        colors: ['#0284c7', '#6366f1'],
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
            labels: {
                style: {
                    colors: '#64748b',
                    fontSize: '12px',
                },
                formatter: (value: number) => `${value}`,
            },
        },
        tooltip: {
            y: {
                formatter: (value: number) => `${value} msgs/min`,
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
                type="area"
                height="100%"
            />
        </div>
    );
};

export default MessageRateChart; 