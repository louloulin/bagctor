import type { NextApiRequest, NextApiResponse } from 'next';

// 生成随机数据点
function generateRandomData(baseValue: number, variability: number, count: number): number[] {
    return Array.from({ length: count }, () => {
        const randomFactor = 1 + (Math.random() * variability * 2 - variability);
        return parseFloat((baseValue * randomFactor).toFixed(2));
    });
}

// 模拟指标数据
function getMetricsData(timeRange: string = '1h') {
    // 根据时间范围确定数据点数量
    let dataPoints;
    switch (timeRange) {
        case '15m':
            dataPoints = 15;
            break;
        case '3h':
            dataPoints = 36;
            break;
        case '24h':
            dataPoints = 24;
            break;
        case '1h':
        default:
            dataPoints = 12;
            break;
    }

    return {
        timestamp: new Date().toISOString(),
        timeRange,

        // 系统指标
        system: {
            cpu: {
                usage: generateRandomData(45, 0.2, dataPoints),
                trend: Math.random() > 0.5 ? 'increasing' : 'stable',
            },
            memory: {
                usage: generateRandomData(65, 0.15, dataPoints),
                trend: 'increasing',
            },
            network: {
                throughput: generateRandomData(2.0, 0.3, dataPoints),
                trend: 'stable',
            },
            disk: {
                usage: generateRandomData(30, 0.2, dataPoints),
                trend: 'stable',
            },
        },

        // Actor系统指标
        actors: {
            counts: {
                total: generateRandomData(300, 0.15, dataPoints),
                active: generateRandomData(150, 0.2, dataPoints),
            },
            creation: {
                rate: generateRandomData(10, 0.4, dataPoints),
            },
            restarts: {
                rate: generateRandomData(1, 1.0, dataPoints),
            },
        },

        // 消息指标
        messaging: {
            rate: {
                sent: generateRandomData(500, 0.25, dataPoints),
                received: generateRandomData(490, 0.25, dataPoints),
            },
            processing: {
                time: generateRandomData(14, 0.2, dataPoints),
                pending: generateRandomData(45, 0.2, dataPoints),
            },
        },
    };
}

// 生成时间类别标签
function getTimeLabels(count: number, timeRange: string): string[] {
    const now = new Date();
    const labels = [];

    // 根据时间范围确定间隔（分钟）
    let intervalMinutes;
    switch (timeRange) {
        case '15m':
            intervalMinutes = 1;
            break;
        case '3h':
            intervalMinutes = 5;
            break;
        case '24h':
            intervalMinutes = 60;
            break;
        case '1h':
        default:
            intervalMinutes = 5;
            break;
    }

    for (let i = count - 1; i >= 0; i--) {
        const time = new Date(now.getTime() - i * intervalMinutes * 60 * 1000);
        labels.push(time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
    }
    return labels;
}

export default function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const { timeRange = '1h' } = req.query;

    const metrics = getMetricsData(timeRange as string);
    const dataPoints = metrics.system.cpu.usage.length;

    res.status(200).json({
        ...metrics,
        timeLabels: getTimeLabels(dataPoints, timeRange as string),
    });
} 