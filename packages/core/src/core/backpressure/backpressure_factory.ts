import { BackpressureController, BackpressureConfig, BackpressureStrategy } from './types';
import { DefaultBackpressureController } from './default_backpressure_controller';
import { log } from '../../utils/logger';

/**
 * 背压控制器工厂类，用于创建不同类型的背压控制器
 */
export class BackpressureFactory {
    /**
     * 创建背压控制器
     * @param config 背压控制器配置
     * @returns 创建的背压控制器实例
     */
    static createController(config: BackpressureConfig): BackpressureController {
        // 设置默认值
        const finalConfig: BackpressureConfig = {
            // 默认高水位线为80%
            highWatermark: config.highWatermark ?? 0.8,
            // 默认低水位线为20%
            lowWatermark: config.lowWatermark ?? 0.2,
            // 必须提供的参数
            maxQueueSize: config.maxQueueSize,
            strategy: config.strategy,
            // 可选参数
            waitTimeout: config.waitTimeout
        };

        log.debug('Creating backpressure controller', {
            strategy: finalConfig.strategy,
            maxQueueSize: finalConfig.maxQueueSize
        });

        // 验证策略
        if (!Object.values(BackpressureStrategy).includes(finalConfig.strategy)) {
            log.error('Unknown backpressure strategy', { strategy: finalConfig.strategy });
            throw new Error(`Unknown backpressure strategy: ${finalConfig.strategy}`);
        }

        // 目前只有一种实现，未来可以根据策略或其他配置创建不同的实现
        return new DefaultBackpressureController(finalConfig);
    }
} 