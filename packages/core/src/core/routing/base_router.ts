import { PID } from '../types';
import { MessageEnvelope } from '../messaging/types';
import { Router, RouterConfig } from './types';
import { log } from '../../utils/logger';

/**
 * 基础路由器类，提供共享的基础功能
 */
export abstract class BaseRouter implements Router {
    protected routees: PID[] = [];

    constructor(config: RouterConfig) {
        if (config.routees && config.routees.length > 0) {
            this.routees = [...config.routees];
        }
    }

    /**
     * 添加一个路由目标
     * @param routee 目标PID
     */
    addRoutee(routee: PID): void {
        // 避免重复添加
        if (!this.routees.some(r => r.id === routee.id)) {
            this.routees.push(routee);
            log.debug('Added routee to router', { routeeId: routee.id });
        }
    }

    /**
     * 移除一个路由目标
     * @param routee 目标PID
     */
    removeRoutee(routee: PID): void {
        const initialLength = this.routees.length;
        this.routees = this.routees.filter(r => r.id !== routee.id);

        if (this.routees.length < initialLength) {
            log.debug('Removed routee from router', { routeeId: routee.id });
        }
    }

    /**
     * 获取当前所有路由目标
     */
    getRoutees(): PID[] {
        return [...this.routees];
    }

    /**
     * 根据路由策略为消息选择一个目标
     * 这是一个抽象方法，需要由子类实现
     * @param message 要路由的消息
     */
    abstract route(message: MessageEnvelope): PID | PID[] | null;

    /**
     * 检查是否有可用的路由目标
     */
    protected hasRoutees(): boolean {
        return this.routees.length > 0;
    }
} 