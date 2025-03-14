import { v4 as uuidv4 } from 'uuid';
import { Actor } from './actor';
import { ActorContext } from './context';
import { ActorSystem } from './system';
import { Props, PID } from './types';
import { log } from '../utils/logger';

/**
 * ActorPool - 管理Actor实例池，减少创建和销毁开销
 * 支持Actor实例的重用和高效分配
 */
export class ActorPool<T extends Actor> {
    private readonly idle: T[] = [];
    private readonly active: Map<string, T> = new Map();
    private readonly factory: (context: ActorContext) => T;
    private readonly system: ActorSystem;
    private readonly maxPoolSize: number;
    private readonly contextMap: Map<string, ActorContext> = new Map();

    /**
     * 创建新的Actor池
     * @param system Actor系统
     * @param factory Actor创建函数
     * @param initialSize 初始池大小
     * @param maxPoolSize 最大池大小
     */
    constructor(
        system: ActorSystem,
        factory: (context: ActorContext) => T,
        initialSize: number = 10,
        maxPoolSize: number = 100
    ) {
        this.system = system;
        this.factory = factory;
        this.maxPoolSize = maxPoolSize;

        log.info(`Creating actor pool with initialSize=${initialSize}, maxPoolSize=${maxPoolSize}`);

        // 预创建Actor
        for (let i = 0; i < initialSize; i++) {
            this.createOneActor();
        }
    }

    /**
     * 从池中获取Actor实例
     * 如果池中没有空闲实例且未达到最大大小，则创建新实例
     */
    async acquire(): Promise<{ pid: PID, instance: T }> {
        if (this.idle.length > 0) {
            // 复用现有Actor
            const actor = this.idle.pop()!;
            const pid = actor['context'].self;
            this.active.set(pid.id, actor);
            await actor.preStart(); // 重新初始化
            log.debug(`Acquired actor from pool, now active=${this.active.size}, idle=${this.idle.length}`);
            return { pid, instance: actor };
        } else if (this.active.size < this.maxPoolSize) {
            // 创建新Actor
            const actor = this.createOneActor();
            const pid = actor['context'].self;
            this.active.set(pid.id, actor);
            await actor.preStart();
            log.debug(`Created new actor in pool, now active=${this.active.size}, idle=${this.idle.length}`);
            return { pid, instance: actor };
        } else {
            // 池已满，等待现有Actor释放
            log.warn(`Actor pool is full (size=${this.maxPoolSize}), waiting for an actor to be released`);
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.idle.length > 0) {
                        clearInterval(checkInterval);
                        this.acquire().then(resolve);
                    }
                }, 10);
            });
        }
    }

    /**
     * 释放Actor实例回池
     * @param pid 要释放的Actor的PID
     */
    release(pid: PID): void {
        const actor = this.active.get(pid.id);
        if (actor) {
            this.active.delete(pid.id);
            actor.postStop().then(() => {
                // 重置Actor状态
                this.resetActor(actor);
                this.idle.push(actor);
                log.debug(`Released actor back to pool, now active=${this.active.size}, idle=${this.idle.length}`);
            });
        } else {
            log.warn(`Attempted to release unknown actor: ${pid.id}`);
        }
    }

    /**
     * 清空池，释放所有Actor
     */
    async clear(): Promise<void> {
        // 释放所有活跃的Actor
        const activeActors = Array.from(this.active.values());
        this.active.clear();

        // 等待所有活跃Actor完成postStop
        await Promise.all(activeActors.map(actor => actor.postStop()));

        // 清空空闲Actor
        this.idle.length = 0;

        log.info(`Cleared actor pool, released ${activeActors.length} active actors`);
    }

    /**
     * 获取池状态信息
     */
    getStats(): { idleCount: number, activeCount: number, totalCount: number } {
        return {
            idleCount: this.idle.length,
            activeCount: this.active.size,
            totalCount: this.idle.length + this.active.size
        };
    }

    /**
     * 创建一个新的Actor实例
     */
    private createOneActor(): T {
        // 创建Actor上下文和实例
        const pid: PID = { id: uuidv4(), address: this.system['address'] || '' };
        const context = new ActorContext(pid, this.system);
        this.contextMap.set(pid.id, context);
        const actor = this.factory(context);
        return actor;
    }

    /**
     * 重置Actor状态，准备复用
     */
    private resetActor(actor: T): void {
        // 重置行为状态，通过['state']访问protected属性
        actor['state'] = { behavior: 'default', data: {} };
    }
} 