import { PID } from '../types';
import { MessageEnvelope } from '../messaging/types';
import { BaseRouter } from './base_router';
import { RouterConfig } from './types';
import { log } from '../../utils/logger';

/**
 * 广播路由器实现
 * 将消息发送给所有路由目标
 */
export class BroadcastRouter extends BaseRouter {
    constructor(config: RouterConfig) {
        super(config);
    }

    /**
     * 广播消息到所有路由目标
     * @param message 要路由的消息
     * @returns 所有目标PID的数组，如果没有可用目标则返回空数组
     */
    route(message: MessageEnvelope): PID[] {
        if (!this.hasRoutees()) {
            log.warn('No routees available for broadcast', { messageId: message.id });
            return [];
        }

        log.debug('Broadcasting message to all routees', {
            messageId: message.id,
            routeeCount: this.routees.length
        });

        // 返回所有路由目标
        return this.getRoutees();
    }
} 