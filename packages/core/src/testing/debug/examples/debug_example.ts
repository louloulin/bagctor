import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '@core/system';
import { ActorDebugger, DebuggerConfig } from '../debugger';
import { ActorVisualizer, VisualizerConfig } from '../visualizer';
import { log } from '@utils/logger';
import { Message, PID } from '@core/types';

describe('Actor System Debugging', () => {
    let system: ActorSystem;
    let actorDebugger: ActorDebugger;
    let visualizer: ActorVisualizer;

    beforeAll(async () => {
        log.info('Initializing actor system for debugging...');
        system = new ActorSystem();
        await system.initialize();

        // 配置调试器
        const debuggerConfig: DebuggerConfig = {
            breakOnMessage: ['test.message'],
            breakOnActor: ['test-actor'],
            logLevel: 'debug',
            captureStackTrace: true,
            recordHistory: true,
            historyLimit: 1000
        };

        // 配置可视化器
        const visualizerConfig: VisualizerConfig = {
            refreshInterval: 1000,
            maxHistoryLength: 100,
            layout: 'force'
        };

        actorDebugger = new ActorDebugger(system, debuggerConfig);
        visualizer = new ActorVisualizer(visualizerConfig);

        // 启动调试工具
        actorDebugger.start();
        visualizer.start();
    });

    afterAll(async () => {
        log.info('Shutting down debugging session...');
        actorDebugger.stop();
        visualizer.stop();
        await system.shutdown();
    });

    test('Debug message flow between actors', async () => {
        // 创建测试actor
        const producer = await system.spawn({
            producer: (context: any) => ({
                receive: async (msg: Message) => {
                    if (msg.type === 'produce') {
                        // 发送测试消息
                        for (let i = 0; i < 5; i++) {
                            await context.send(msg.payload.target, {
                                type: 'test.message',
                                payload: { data: `Message ${i}` }
                            });
                        }
                    }
                }
            })
        });

        const consumer = await system.spawn({
            producer: (context: any) => ({
                receive: async (msg: Message) => {
                    if (msg.type === 'test.message') {
                        log.info(`Consumer received: ${msg.payload.data}`);
                        // 更新actor状态
                        context.setState({
                            lastMessage: msg.payload.data,
                            messageCount: (context.getState().messageCount || 0) + 1
                        });
                    }
                }
            })
        });

        // 触发消息流
        await system.send(producer, {
            type: 'produce',
            payload: { target: consumer }
        });

        // 等待消息处理
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 验证调试信息
        const messageHistory = actorDebugger.getMessageHistory();
        const consumerState = actorDebugger.getActorState(consumer);
        const visualGraph = visualizer.getCurrentGraph();

        // 验证消息历史
        expect(messageHistory.length).toBeGreaterThan(0);
        expect(messageHistory.some(m => m.type === 'test.message')).toBe(true);

        // 验证actor状态
        expect(consumerState).toBeDefined();
        if (consumerState) {
            expect(consumerState.state.messageCount).toBe(5);
        }

        // 验证可视化图
        expect(visualGraph.nodes.length).toBeGreaterThan(0);
        expect(visualGraph.edges.length).toBeGreaterThan(0);

        // 输出调试报告
        log.info('\n=== Debug Report ===');
        log.info(`Messages Processed: ${messageHistory.length}`);
        log.info(`Actor States Tracked: ${actorDebugger.getAllActorStates().length}`);
        log.info(`Visualization Nodes: ${visualGraph.nodes.length}`);
        log.info(`Visualization Edges: ${visualGraph.edges.length}`);
    });
}); 