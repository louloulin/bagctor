import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';

// 生成随机数据点
function generateRandomData(baseValue: number, variability: number, count: number): number[] {
    return Array.from({ length: count }, () => {
        const randomFactor = 1 + (Math.random() * variability * 2 - variability);
        return parseFloat((baseValue * randomFactor).toFixed(2));
    });
}

// 模拟Worker数据
function getWorkerData(timeRange: string = '1h') {
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

    // 生成模拟Worker数据
    const workerCount = Math.floor(Math.random() * 3) + 8; // 8-10个workers
    const workers = [];

    for (let i = 0; i < workerCount; i++) {
        const status = Math.random() > 0.7 ?
            'idle' : (Math.random() > 0.1 ? 'active' : 'terminated');

        const taskCount = Math.floor(Math.random() * 150) + 50;
        const errorRate = Math.random() * 0.05; // 0-5%的错误率
        const errorCount = Math.floor(taskCount * errorRate);
        const successCount = taskCount - errorCount;

        // 生成上次活动时间，随机在过去24小时内
        const lastActive = new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000);

        workers.push({
            id: uuidv4(),
            status,
            uptime: Math.floor(Math.random() * 86400) + 3600, // 1小时到1天的运行时间
            taskCount,
            successCount,
            errorCount,
            cpuUsage: Math.floor(Math.random() * 80) + 10, // 10-90%的CPU使用率
            memoryUsage: Math.floor(Math.random() * 70) + 20, // 20-90%的内存使用率
            lastActive: lastActive.toISOString()
        });
    }

    // 生成Worker池状态数据
    const activeWorkers = workers.filter(w => w.status === 'active').length;
    const idleWorkers = workers.filter(w => w.status === 'idle').length;
    const terminatedWorkers = workers.filter(w => w.status === 'terminated').length;

    const pendingTasks = Math.floor(Math.random() * 20);
    const processingTasks = Math.floor(Math.random() * 30);
    const completedTasks = Math.floor(Math.random() * 1000) + 500;
    const failedTasks = Math.floor(Math.random() * 50);

    const poolStatus = {
        totalWorkers: workerCount,
        activeWorkers,
        idleWorkers,
        terminatedWorkers,
        pendingTasks,
        processingTasks,
        completedTasks,
        failedTasks,
        avgProcessingTime: Math.random() * 30 + 20, // 20-50ms处理时间
        throughputPerSecond: Math.random() * 50 + 10 // 10-60任务/秒
    };

    // 生成任务类型分布
    const taskTypes = [
        'CPU_INTENSIVE',
        'IO_INTENSIVE',
        'LOW_LATENCY',
        'BATCH',
        'CUSTOM'
    ].map(type => {
        return {
            type,
            count: Math.floor(Math.random() * 200) + 50,
            avgProcessingTime: Math.random() * 100 + 10,
            errorRate: Math.random() * 0.08 // 0-8%的错误率
        };
    });

    // 生成近期任务数据
    const recentTasks = [];
    const taskStatuses = ['pending', 'processing', 'completed', 'failed'];
    const taskStatusWeights = [0.1, 0.2, 0.6, 0.1]; // 权重分布

    for (let i = 0; i < 15; i++) {
        // 根据权重分布选择状态
        let statusIndex = 0;
        let r = Math.random();
        let cumulativeWeight = 0;

        for (let j = 0; j < taskStatusWeights.length; j++) {
            cumulativeWeight += taskStatusWeights[j];
            if (r <= cumulativeWeight) {
                statusIndex = j;
                break;
            }
        }

        const status = taskStatuses[statusIndex] as 'pending' | 'processing' | 'completed' | 'failed';
        const startTime = new Date(Date.now() - Math.random() * 3600 * 1000); // 1小时内
        let endTime, duration, error;

        if (status === 'completed' || status === 'failed') {
            // 结束时间在开始时间之后
            const processingTime = Math.random() * 2000 + 50; // 50-2050ms处理时间
            endTime = new Date(startTime.getTime() + processingTime);
            duration = processingTime;

            if (status === 'failed') {
                error = 'Task execution failed: ' + ['Timeout', 'Internal Error', 'Resource Unavailable'][Math.floor(Math.random() * 3)];
            }
        }

        recentTasks.push({
            id: uuidv4(),
            type: taskTypes[Math.floor(Math.random() * taskTypes.length)].type,
            workerId: workers[Math.floor(Math.random() * workers.length)].id,
            status,
            startTime: startTime.toISOString(),
            endTime: endTime?.toISOString(),
            duration,
            error
        });
    }

    return {
        workers,
        poolStatus,
        taskTypes,
        recentTasks,
        timestamp: new Date().toISOString()
    };
}

export default function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const { timeRange = '1h' } = req.query;

    const data = getWorkerData(timeRange as string);

    res.status(200).json(data);
} 