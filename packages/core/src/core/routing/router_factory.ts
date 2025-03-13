import { Router, RouterConfig, RouterStrategy } from './types';
import { RoundRobinRouter } from './round_robin_router';
import { RandomRouter } from './random_router';
import { BroadcastRouter } from './broadcast_router';
import { ConsistentHashRouter } from './consistent_hash_router';
import { log } from '../../utils/logger';

/**
 * 路由器工厂类，用于创建不同类型的路由器实例
 */
export class RouterFactory {
    /**
     * 创建路由器实例
     * @param config 路由器配置
     * @returns 创建的路由器实例
     */
    static createRouter(config: RouterConfig): Router {
        log.debug('Creating router', { strategy: config.strategy });

        switch (config.strategy) {
            case RouterStrategy.ROUND_ROBIN:
                return new RoundRobinRouter(config);

            case RouterStrategy.RANDOM:
                return new RandomRouter(config);

            case RouterStrategy.BROADCAST:
                return new BroadcastRouter(config);

            case RouterStrategy.CONSISTENT_HASH:
                if (!config.hashFunction) {
                    log.warn('No hash function provided for consistent hash router, using default');
                }
                return new ConsistentHashRouter(config);

            default:
                log.error('Unknown router strategy', { strategy: config.strategy });
                throw new Error(`Unknown router strategy: ${config.strategy}`);
        }
    }
} 