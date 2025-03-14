import type { NextApiRequest, NextApiResponse } from 'next';

// 告警严重性
export enum AlertSeverity {
    Critical = 'critical',
    High = 'high',
    Medium = 'medium',
    Low = 'low',
    Info = 'info',
}

// 告警状态
export enum AlertState {
    Firing = 'firing',
    Resolved = 'resolved',
    Acknowledged = 'acknowledged',
    Silenced = 'silenced',
}

// 告警接口
export interface Alert {
    id: string;
    name: string;
    description: string;
    severity: AlertSeverity;
    state: AlertState;
    startsAt: string;
    endsAt: string | null;
    metricName: string;
    metricValue: number;
    labels: Record<string, string>;
}

// 生成随机的过去时间
function randomPastTime(maxMinutesAgo: number): string {
    const now = new Date();
    const minutesAgo = Math.floor(Math.random() * maxMinutesAgo);
    const date = new Date(now.getTime() - minutesAgo * 60 * 1000);
    return date.toISOString();
}

// 生成随机的结束时间（有些告警可能已解决）
function randomEndTime(startTime: string, resolutionProbability: number): string | null {
    if (Math.random() > resolutionProbability) {
        return null;
    }

    const startDate = new Date(startTime);
    const minutesLater = Math.floor(Math.random() * 30) + 5; // 5-35分钟后解决
    const endDate = new Date(startDate.getTime() + minutesLater * 60 * 1000);

    return endDate.toISOString();
}

// 模拟告警数据
const mockAlerts: Alert[] = [
    {
        id: 'alert-001',
        name: 'High CPU Usage',
        description: 'System CPU usage exceeds 80% for more than 5 minutes',
        severity: AlertSeverity.High,
        state: AlertState.Firing,
        startsAt: randomPastTime(30),
        endsAt: null,
        metricName: 'system.cpu.usage',
        metricValue: 87.5,
        labels: {
            instance: 'server-01',
            service: 'api-gateway',
            region: 'us-west-1',
        },
    },
    {
        id: 'alert-002',
        name: 'Memory Usage Warning',
        description: 'System memory usage exceeds 75% for more than 10 minutes',
        severity: AlertSeverity.Medium,
        state: AlertState.Acknowledged,
        startsAt: randomPastTime(45),
        endsAt: null,
        metricName: 'system.memory.usage',
        metricValue: 78.2,
        labels: {
            instance: 'server-02',
            service: 'database',
            region: 'us-west-1',
        },
    },
    {
        id: 'alert-003',
        name: 'High Actor Restart Rate',
        description: 'Actor restart rate is above threshold (5 per minute)',
        severity: AlertSeverity.Critical,
        state: AlertState.Firing,
        startsAt: randomPastTime(15),
        endsAt: null,
        metricName: 'actor.restart.rate',
        metricValue: 12,
        labels: {
            actorType: 'UserSessionActor',
            service: 'user-service',
            region: 'us-east-1',
        },
    },
    {
        id: 'alert-004',
        name: 'Network Throughput Degraded',
        description: 'Network throughput is below expected threshold for service',
        severity: AlertSeverity.Low,
        state: AlertState.Resolved,
        startsAt: randomPastTime(120),
        endsAt: randomEndTime(randomPastTime(120), 1.0),
        metricName: 'system.network.throughput',
        metricValue: 1.2,
        labels: {
            interface: 'eth0',
            service: 'file-service',
            region: 'eu-central-1',
        },
    },
    {
        id: 'alert-005',
        name: 'High Message Pending Rate',
        description: 'Too many messages are pending in the queue',
        severity: AlertSeverity.Medium,
        state: AlertState.Silenced,
        startsAt: randomPastTime(60),
        endsAt: null,
        metricName: 'messaging.pending.count',
        metricValue: 245,
        labels: {
            queue: 'main-queue',
            service: 'messaging-service',
            region: 'ap-southeast-1',
        },
    },
    {
        id: 'alert-006',
        name: 'Disk Usage Critical',
        description: 'Disk usage has reached 95% of capacity',
        severity: AlertSeverity.Critical,
        state: AlertState.Firing,
        startsAt: randomPastTime(10),
        endsAt: null,
        metricName: 'system.disk.usage',
        metricValue: 95.3,
        labels: {
            mountpoint: '/data',
            service: 'storage-service',
            region: 'us-west-2',
        },
    },
    {
        id: 'alert-007',
        name: 'Message Processing Time High',
        description: 'Average message processing time exceeds 100ms',
        severity: AlertSeverity.High,
        state: AlertState.Firing,
        startsAt: randomPastTime(25),
        endsAt: null,
        metricName: 'messaging.processing.time',
        metricValue: 142.5,
        labels: {
            messageType: 'TransactionRequest',
            service: 'payment-service',
            region: 'eu-west-1',
        },
    },
    {
        id: 'alert-008',
        name: 'Actor Creation Rate Anomaly',
        description: 'Unusual spike in actor creation rate detected',
        severity: AlertSeverity.Info,
        state: AlertState.Acknowledged,
        startsAt: randomPastTime(40),
        endsAt: null,
        metricName: 'actor.creation.rate',
        metricValue: 35,
        labels: {
            actorType: 'WorkflowActor',
            service: 'workflow-service',
            region: 'us-east-2',
        },
    },
];

// 生成更多随机告警
function generateRandomAlerts(count: number): Alert[] {
    const actorTypes = ['UserActor', 'SessionActor', 'WorkflowActor', 'PaymentActor', 'NotificationActor'];
    const services = ['user-service', 'auth-service', 'payment-service', 'notification-service', 'api-gateway'];
    const regions = ['us-west-1', 'us-east-1', 'eu-west-1', 'ap-southeast-1', 'eu-central-1'];
    const severities = Object.values(AlertSeverity);
    const states = Object.values(AlertState);
    const metricNames = [
        'system.cpu.usage', 'system.memory.usage', 'system.disk.usage', 'system.network.throughput',
        'actor.count', 'actor.restart.rate', 'messaging.rate', 'messaging.pending', 'messaging.processing.time'
    ];

    const additionalAlerts: Alert[] = [];

    for (let i = 0; i < count; i++) {
        const severity = severities[Math.floor(Math.random() * severities.length)];
        const state = states[Math.floor(Math.random() * states.length)];
        const metricName = metricNames[Math.floor(Math.random() * metricNames.length)];
        const service = services[Math.floor(Math.random() * services.length)];
        const region = regions[Math.floor(Math.random() * regions.length)];
        const actorType = actorTypes[Math.floor(Math.random() * actorTypes.length)];

        const startsAt = randomPastTime(180);
        const resolutionProbability = state === AlertState.Resolved ? 1.0 : 0.3;
        const endsAt = randomEndTime(startsAt, resolutionProbability);

        // 如果状态是已解决，确保有结束时间
        const finalState = endsAt ? AlertState.Resolved : state;

        additionalAlerts.push({
            id: `alert-${mockAlerts.length + i + 1}`.padStart(9, '0'),
            name: `${severity.charAt(0).toUpperCase() + severity.slice(1)} ${metricName.split('.').join(' ')}`,
            description: `Alert for ${metricName} in ${service} service`,
            severity: severity as AlertSeverity,
            state: finalState as AlertState,
            startsAt,
            endsAt,
            metricName,
            metricValue: Math.floor(Math.random() * 100),
            labels: {
                service,
                region,
                actorType,
            },
        });
    }

    return additionalAlerts;
}

export default function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    const { showResolved, severity } = req.query;

    // 合并预定义告警和随机生成的告警
    const allAlerts = [...mockAlerts, ...generateRandomAlerts(10)];

    // 筛选告警
    let filteredAlerts = allAlerts;

    // 是否显示已解决的告警
    if (showResolved !== 'true') {
        filteredAlerts = filteredAlerts.filter(alert => alert.state !== AlertState.Resolved);
    }

    // 按严重性筛选
    if (severity && severity !== 'all') {
        filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
    }

    res.status(200).json({
        total: filteredAlerts.length,
        firingCount: filteredAlerts.filter(a => a.state === AlertState.Firing).length,
        resolvedCount: filteredAlerts.filter(a => a.state === AlertState.Resolved).length,
        alerts: filteredAlerts,
    });
} 