import { PID } from '../types';
import { MessageEnvelope } from '../messaging/types';
import { BaseRouter } from './base_router';
import { RouterConfig } from './types';
import { log } from '../../utils/logger';

/**
 * 随机路由器实现
 * 随机选择一个路由目标进行消息分发
 */
export class RandomRouter extends BaseRouter {
    constructor(config: RouterConfig) {
        super(config);
    }

    /**
     * 使用随机算法选择一个路由目标
     * @param message 要路由的消息
     * @returns 选择的目标PID，如果没有可用目标则返回null
     */
    route(message: MessageEnvelope): PID | null {
        if (!this.hasRoutees()) {
            log.warn('No routees available for routing', { messageId: message.id });
            return null;
        }

        // 生成随机索引，取值范围是[0, routees.length-1]
        const randomIndex = Math.floor(Math.random() * this.routees.length);
        const routee = this.routees[randomIndex];

        log.debug('Random router selected routee', {
            messageId: message.id,
            routeeId: routee.id
        });

        return routee;
    }
} 