import React, { useState, useEffect } from 'react';
import { useWebSocket } from './WebSocketContext';

/**
 * 模拟WebSocket服务器组件
 * 
 * 这个组件主要用于开发和测试目的，它模拟了一个WebSocket服务器，
 * 定期发送模拟数据包，以便在实际WebSocket服务器集成之前测试实时功能。
 */
const MockWebSocketServer: React.FC = () => {
    const { status, isConnected, connect, disconnect } = useWebSocket();
    const [isMocking, setIsMocking] = useState(false);
    const [interval, setInterval] = useState(5000); // 默认5秒间隔

    // 开始/停止模拟
    const toggleMocking = () => {
        setIsMocking(!isMocking);
    };

    // 更新模拟间隔
    const handleIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setInterval(parseInt(e.target.value, 10));
    };

    // 状态颜色
    const getStatusColor = () => {
        switch (status) {
            case 'open':
                return 'bg-success';
            case 'connecting':
                return 'bg-warning';
            case 'error':
            case 'closed':
                return 'bg-danger';
            default:
                return 'bg-gray-400';
        }
    };

    return (
        <div className="modern-card p-4 mb-6">
            <h3 className="text-lg font-medium mb-2">WebSocket Simulation</h3>
            <p className="text-sm text-muted-foreground mb-4">
                Use this tool to simulate real-time data updates while developing.
            </p>

            <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center">
                    <span className={`flex h-3 w-3 rounded-full mr-2 ${getStatusColor()}`}></span>
                    <span className="text-sm">
                        Status: <span className="font-medium">{status}</span>
                    </span>
                </div>

                <div>
                    <button
                        className={`btn ${isConnected ? 'btn-outline' : 'btn-primary'} btn-sm`}
                        onClick={isConnected ? disconnect : connect}
                    >
                        {isConnected ? 'Disconnect' : 'Connect'}
                    </button>
                </div>

                <div className="flex items-center space-x-2">
                    <span className="text-sm">Interval:</span>
                    <select
                        className="rounded-md border border-input bg-background px-3 py-1 text-sm"
                        value={interval}
                        onChange={handleIntervalChange}
                        disabled={!isConnected}
                    >
                        <option value="1000">1s</option>
                        <option value="5000">5s</option>
                        <option value="10000">10s</option>
                        <option value="30000">30s</option>
                    </select>
                </div>

                <div>
                    <button
                        className={`btn ${isMocking ? 'btn-danger' : 'btn-success'} btn-sm`}
                        onClick={toggleMocking}
                        disabled={!isConnected}
                    >
                        {isMocking ? 'Stop Simulation' : 'Start Simulation'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/**
 * 模拟数据生成器
 * 
 * 此组件仅在 isMocking 为 true 时生成模拟数据并发送到WebSocket。
 * 它不会渲染任何UI元素。
 */
export const MockDataGenerator: React.FC<{
    isMocking: boolean;
    interval: number;
}> = ({ isMocking, interval }) => {
    const { sendMessage, isConnected } = useWebSocket();

    useEffect(() => {
        if (!isMocking || !isConnected) return;

        // 设置定时器发送模拟数据
        const timer = setInterval(() => {
            // 随机生成不同类型的模拟数据
            const mockDataTypes = ['metrics', 'alerts', 'workers', 'system'];
            const type = mockDataTypes[Math.floor(Math.random() * mockDataTypes.length)];

            // 基于类型生成模拟数据
            let data;

            switch (type) {
                case 'metrics':
                    data = {
                        timestamp: new Date().toISOString(),
                        cpu: Math.random() * 100,
                        memory: Math.random() * 100,
                        network: {
                            in: Math.random() * 1000,
                            out: Math.random() * 1000
                        },
                        actors: {
                            active: Math.floor(Math.random() * 500),
                            pending: Math.floor(Math.random() * 50)
                        }
                    };
                    break;

                case 'alerts':
                    const alertTypes = ['critical', 'error', 'warning', 'info'];
                    const alertSeverity = alertTypes[Math.floor(Math.random() * alertTypes.length)];
                    data = {
                        id: `alert-${Date.now()}`,
                        timestamp: new Date().toISOString(),
                        name: `Mock ${alertSeverity} Alert`,
                        description: `This is a mock ${alertSeverity} alert for demonstration`,
                        severity: alertSeverity,
                        state: Math.random() > 0.7 ? 'resolved' : 'firing',
                        metricValue: Math.random() * 100
                    };
                    break;

                case 'workers':
                    data = {
                        timestamp: new Date().toISOString(),
                        workers: Array.from({ length: 5 }, (_, i) => ({
                            id: `worker-${i}`,
                            status: Math.random() > 0.9 ? 'error' : Math.random() > 0.8 ? 'warning' : 'healthy',
                            tasks: Math.floor(Math.random() * 20),
                            cpu: Math.random() * 100,
                            memory: Math.random() * 100
                        }))
                    };
                    break;

                case 'system':
                    data = {
                        timestamp: new Date().toISOString(),
                        uptime: Math.floor(Math.random() * 8640000), // 最多100天的秒数
                        load: [Math.random() * 10, Math.random() * 8, Math.random() * 6],
                        disk: {
                            total: 1000,
                            used: Math.random() * 1000
                        }
                    };
                    break;
            }

            // 发送模拟数据
            sendMessage({
                type,
                data
            });

        }, interval);

        return () => clearInterval(timer);
    }, [isMocking, interval, sendMessage, isConnected]);

    // 这个组件不渲染任何内容
    return null;
};

export default MockWebSocketServer; 