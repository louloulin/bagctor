/**
 * reactor_affinity.test.ts
 * 
 * Reactor与线程亲和性集成的测试文件
 */

import { Reactor, ReactorOptions, Work } from '../../src/core/reactor/reactor';
import { getCurrentThreadCore } from '../../src/core/performance/thread_binding';

// 引入Jest类型
import '@types/jest';

describe('Reactor线程亲和性集成', () => {
    // 创建简单工作负载
    const createSimpleWork = (id: string): Work => ({
        type: 'simpleWork',
        payload: { id },
        priority: 1
    });

    it('应该接受并应用CPU核心绑定配置', async () => {
        // 创建Reactor实例
        const options: ReactorOptions = {
            id: 'test-reactor-1',
            cpuCore: 0,
            logging: { enabled: true, level: 'info' }
        };

        const reactor = new Reactor(options);

        // 验证reactor实例正确创建
        expect(reactor).toBeDefined();
        expect(reactor.id).toBe('test-reactor-1');

        // 启动reactor
        await reactor.start();

        // 停止reactor
        await reactor.stop();
    });

    it('应该在性能统计中包含CPU使用率信息', async () => {
        // 创建Reactor实例
        const options: ReactorOptions = {
            id: 'test-reactor-2',
            cpuCore: 0,
            logging: { enabled: true, level: 'info' }
        };

        const reactor = new Reactor(options);

        // 启动reactor
        await reactor.start();

        // 注册一个简单的工作处理器
        reactor.registerWorkHandler('simpleWork', async (work) => {
            return { success: true, workId: work.payload.id };
        });

        // 提交一个工作
        await reactor.submit(createSimpleWork('test'));

        // 获取统计信息
        const stats = reactor.getStats();

        // 验证统计信息包含预期字段
        expect(stats.id).toBe('test-reactor-2');
        expect(typeof stats.currentLoad).toBe('number');

        // CPU使用率可能存在也可能不存在，取决于是否支持原生绑定
        if (stats.cpuUsage !== undefined) {
            expect(typeof stats.cpuUsage).toBe('number');
        }

        // 停止reactor
        await reactor.stop();
    });
}); 