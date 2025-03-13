import { describe, test, expect } from 'bun:test';
import { BackpressureFactory } from '../../../core/backpressure/backpressure_factory';
import { DefaultBackpressureController } from '../../../core/backpressure/default_backpressure_controller';
import { BackpressureStrategy, BackpressureConfig } from '../../../core/backpressure/types';

describe('BackpressureFactory', () => {
    test('should create a DefaultBackpressureController with DROP_NEW strategy', () => {
        const config: BackpressureConfig = {
            maxQueueSize: 100,
            highWatermark: 0.8,
            lowWatermark: 0.2,
            strategy: BackpressureStrategy.DROP_NEW
        };

        const controller = BackpressureFactory.createController(config);

        expect(controller).toBeInstanceOf(DefaultBackpressureController);
        expect(controller.isBackpressureActive()).toBe(false);
        expect(controller.getQueueSize()).toBe(0);
        expect(controller.getQueueUtilization()).toBe(0);
    });

    test('should create a DefaultBackpressureController with DROP_OLD strategy', () => {
        const config: BackpressureConfig = {
            maxQueueSize: 100,
            highWatermark: 0.8,
            lowWatermark: 0.2,
            strategy: BackpressureStrategy.DROP_OLD
        };

        const controller = BackpressureFactory.createController(config);

        expect(controller).toBeInstanceOf(DefaultBackpressureController);
    });

    test('should create a DefaultBackpressureController with THROW strategy', () => {
        const config: BackpressureConfig = {
            maxQueueSize: 100,
            highWatermark: 0.8,
            lowWatermark: 0.2,
            strategy: BackpressureStrategy.THROW
        };

        const controller = BackpressureFactory.createController(config);

        expect(controller).toBeInstanceOf(DefaultBackpressureController);
    });

    test('should create a DefaultBackpressureController with WAIT strategy', () => {
        const config: BackpressureConfig = {
            maxQueueSize: 100,
            highWatermark: 0.8,
            lowWatermark: 0.2,
            strategy: BackpressureStrategy.WAIT,
            waitTimeout: 1000
        };

        const controller = BackpressureFactory.createController(config);

        expect(controller).toBeInstanceOf(DefaultBackpressureController);
    });

    test('should create a DefaultBackpressureController with default values', () => {
        // 只提供必要的配置
        const controller = BackpressureFactory.createController({
            maxQueueSize: 100,
            strategy: BackpressureStrategy.DROP_NEW
        });

        expect(controller).toBeInstanceOf(DefaultBackpressureController);
        // 默认水位线值应该被设置
        expect(controller.getQueueUtilization()).toBe(0);
    });

    test('should throw error for invalid configuration', () => {
        // 测试无效的队列大小
        expect(() => {
            BackpressureFactory.createController({
                maxQueueSize: 0, // 无效值
                strategy: BackpressureStrategy.DROP_NEW
            });
        }).toThrow();

        // 测试无效的高水位线
        expect(() => {
            BackpressureFactory.createController({
                maxQueueSize: 100,
                highWatermark: 1.5, // 无效值
                strategy: BackpressureStrategy.DROP_NEW
            });
        }).toThrow();

        // 测试无效的低水位线
        expect(() => {
            BackpressureFactory.createController({
                maxQueueSize: 100,
                lowWatermark: -0.1, // 无效值
                strategy: BackpressureStrategy.DROP_NEW
            });
        }).toThrow();
    });

    test('should throw error for unknown strategy', () => {
        expect(() => {
            BackpressureFactory.createController({
                maxQueueSize: 100,
                strategy: 'UNKNOWN_STRATEGY' as BackpressureStrategy
            });
        }).toThrow();
    });
}); 