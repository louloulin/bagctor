import { PID } from '../types';
import { MessageEnvelope } from '../messaging/types';
import { BaseRouter } from './base_router';
import { RouterConfig } from './types';
import { log } from '../../utils/logger';

/**
 * 轮询路由器实现
 * 按顺序将消息分发给所有路由目标
 */
export class RoundRobinRouter extends BaseRouter {
    private currentIndex = 0;

    constructor(config: RouterConfig) {
        super(config);
    }

    /**
     * 使用轮询算法选择下一个路由目标
     * @param message 要路由的消息
     * @returns 选择的目标PID，如果没有可用目标则返回null
     */
    route(message: MessageEnvelope): PID | null {
        if (!this.hasRoutees()) {
            log.warn('No routees available for routing', { messageId: message.id });
            return null;
        }

        // 选择当前索引指向的路由目标
        const routee = this.routees[this.currentIndex];

        // 更新索引为下一个位置，如果到达末尾则循环回开头
        this.currentIndex = (this.currentIndex + 1) % this.routees.length;

        log.debug('Round robin router selected routee', {
            messageId: message.id,
            routeeId: routee.id
        });

        return routee;
    }
} 