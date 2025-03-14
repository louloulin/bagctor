import type { NextApiRequest, NextApiResponse } from 'next';

// Actor类型分布接口
interface ActorTypeDistribution {
    type: string;
    count: number;
    status: {
        active: number;
        idle: number;
        stopped: number;
        restarting: number;
    };
    averageMessageProcessingTime: number;
    errorRate: number;
    memoryUsage: number;
}

// 系统中的Actor类型数据
const mockActorTypes: ActorTypeDistribution[] = [
    {
        type: 'UserSessionActor',
        count: 142,
        status: {
            active: 98,
            idle: 40,
            stopped: 2,
            restarting: 2,
        },
        averageMessageProcessingTime: 5.2,
        errorRate: 0.02,
        memoryUsage: 128,
    },
    {
        type: 'AuthenticationActor',
        count: 32,
        status: {
            active: 25,
            idle: 5,
            stopped: 1,
            restarting: 1,
        },
        averageMessageProcessingTime: 3.8,
        errorRate: 0.01,
        memoryUsage: 96,
    },
    {
        type: 'PaymentProcessorActor',
        count: 18,
        status: {
            active: 10,
            idle: 7,
            stopped: 0,
            restarting: 1,
        },
        averageMessageProcessingTime: 15.6,
        errorRate: 0.05,
        memoryUsage: 256,
    },
    {
        type: 'NotificationActor',
        count: 35,
        status: {
            active: 22,
            idle: 12,
            stopped: 1,
            restarting: 0,
        },
        averageMessageProcessingTime: 7.3,
        errorRate: 0.03,
        memoryUsage: 112,
    },
    {
        type: 'DataAnalyticsActor',
        count: 15,
        status: {
            active: 8,
            idle: 6,
            stopped: 1,
            restarting: 0,
        },
        averageMessageProcessingTime: 28.4,
        errorRate: 0.04,
        memoryUsage: 320,
    },
    {
        type: 'WorkflowActor',
        count: 42,
        status: {
            active: 30,
            idle: 10,
            stopped: 1,
            restarting: 1,
        },
        averageMessageProcessingTime: 12.5,
        errorRate: 0.02,
        memoryUsage: 192,
    },
    {
        type: 'CacheActor',
        count: 25,
        status: {
            active: 20,
            idle: 5,
            stopped: 0,
            restarting: 0,
        },
        averageMessageProcessingTime: 0.8,
        errorRate: 0.005,
        memoryUsage: 512,
    },
    {
        type: 'ApiGatewayActor',
        count: 8,
        status: {
            active: 8,
            idle: 0,
            stopped: 0,
            restarting: 0,
        },
        averageMessageProcessingTime: 4.2,
        errorRate: 0.01,
        memoryUsage: 192,
    },
    {
        type: 'FileStorageActor',
        count: 12,
        status: {
            active: 5,
            idle: 7,
            stopped: 0,
            restarting: 0,
        },
        averageMessageProcessingTime: 22.7,
        errorRate: 0.03,
        memoryUsage: 256,
    },
    {
        type: 'LoggingActor',
        count: 5,
        status: {
            active: 5,
            idle: 0,
            stopped: 0,
            restarting: 0,
        },
        averageMessageProcessingTime: 1.5,
        errorRate: 0.001,
        memoryUsage: 128,
    },
];

// 生成随机小幅度变化的Actor数据
function getUpdatedActorData(): ActorTypeDistribution[] {
    return mockActorTypes.map(actor => {
        // 小幅度随机变化
        const randomFactor = () => 1 + (Math.random() * 0.2 - 0.1);

        // 活跃Actor数量的随机变化
        const activeChange = Math.floor(Math.random() * 3) - 1; // -1, 0, 或 1
        let active = actor.status.active + activeChange;
        active = Math.max(0, Math.min(active, actor.count));

        // 确保各状态总和等于总数
        const idle = Math.max(0, actor.count - active - actor.status.stopped - actor.status.restarting);

        return {
            ...actor,
            count: Math.max(1, Math.floor(actor.count * randomFactor())),
            status: {
                active,
                idle,
                stopped: actor.status.stopped,
                restarting: actor.status.restarting,
            },
            averageMessageProcessingTime: parseFloat((actor.averageMessageProcessingTime * randomFactor()).toFixed(1)),
            errorRate: parseFloat((actor.errorRate * randomFactor()).toFixed(3)),
            memoryUsage: Math.floor(actor.memoryUsage * randomFactor()),
        };
    });
}

// 系统概览数据接口
interface SystemOverview {
    totalActors: number;
    activeActors: number;
    messageRate: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
}

// 生成系统概览数据
function getSystemOverview(actorData: ActorTypeDistribution[]): SystemOverview {
    const totalActors = actorData.reduce((sum, actor) => sum + actor.count, 0);
    const activeActors = actorData.reduce((sum, actor) => sum + actor.status.active, 0);

    return {
        totalActors,
        activeActors,
        messageRate: Math.floor(Math.random() * 500) + 500, // 500-1000 msgs/sec
        errorRate: parseFloat((Math.random() * 0.05).toFixed(3)), // 0-5% error rate
        cpuUsage: parseFloat((Math.random() * 30 + 40).toFixed(1)), // 40-70% CPU usage
        memoryUsage: parseFloat((Math.random() * 30 + 50).toFixed(1)), // 50-80% memory usage
        uptime: Math.floor(Math.random() * 240) + 120, // 2-6 hours in minutes
    };
}

export default function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const actorData = getUpdatedActorData();
    const overview = getSystemOverview(actorData);

    res.status(200).json({
        timestamp: new Date().toISOString(),
        overview,
        actorTypes: actorData,
    });
} 