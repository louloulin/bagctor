import { PID } from '../types';
import { MessageEnvelope } from '../messaging/types';

/**
 * 路由策略枚举，定义不同的路由算法
 */
export enum RouterStrategy {
    ROUND_ROBIN = 'round-robin',
    RANDOM = 'random',
    BROADCAST = 'broadcast',
    CONSISTENT_HASH = 'consistent-hash'
}

/**
 * 路由器配置接口
 */
export interface RouterConfig {
    strategy: RouterStrategy;
    routees: PID[];
    hashFunction?: (message: MessageEnvelope) => string | number;
}

/**
 * 路由器接口，定义路由器的基本行为
 */
export interface Router {
    /**
     * 添加一个路由目标
     * @param routee 目标PID
     */
    addRoutee(routee: PID): void;

    /**
     * 移除一个路由目标
     * @param routee 目标PID
     */
    removeRoutee(routee: PID): void;

    /**
     * 获取当前所有路由目标
     */
    getRoutees(): PID[];

    /**
     * 根据路由策略为消息选择一个目标
     * @param message 要路由的消息
     * @returns 选择的目标PID，如果没有可用目标则返回null
     */
    route(message: MessageEnvelope): PID | PID[] | null;
} 