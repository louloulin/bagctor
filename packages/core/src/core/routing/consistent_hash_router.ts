import { PID } from '../types';
import { MessageEnvelope } from '../messaging/types';
import { BaseRouter } from './base_router';
import { RouterConfig } from './types';
import { log } from '../../utils/logger';

/**
 * 一致性哈希路由器实现
 * 根据消息的哈希值选择一个路由目标，确保相同的消息总是路由到相同的目标
 */
export class ConsistentHashRouter extends BaseRouter {
    private readonly hashRing: Map<number, PID> = new Map();
    // 增加虚拟节点数量，提高分布均匀性
    private readonly virtualNodes: number = 100; // 每个实际节点的虚拟节点数量
    private readonly hashFunction: (message: MessageEnvelope) => string | number;

    // 用于优化查找的排序数组
    private sortedHashes: number[] = [];

    // 性能指标
    private lookupCount: number = 0;
    private totalLookupTime: number = 0;

    constructor(config: RouterConfig) {
        super(config);

        // 使用配置中指定的虚拟节点数量或默认值
        if (config.virtualNodes && config.virtualNodes > 0) {
            this.virtualNodes = config.virtualNodes;
        }

        // 使用配置中的哈希函数或默认哈希函数
        this.hashFunction = config.hashFunction || this.defaultHashFunction;

        log.debug('Creating consistent hash router', {
            routeeCount: this.routees.length,
            virtualNodesPerRoutee: this.virtualNodes
        });

        // 构建哈希环
        this.buildHashRing();
    }

    /**
     * 添加一个路由目标并重建哈希环
     * @param routee 目标PID
     */
    override addRoutee(routee: PID): void {
        super.addRoutee(routee);
        this.buildHashRing();
    }

    /**
     * 移除一个路由目标并重建哈希环
     * @param routee 目标PID
     */
    override removeRoutee(routee: PID): void {
        super.removeRoutee(routee);
        this.buildHashRing();
    }

    /**
     * 使用一致性哈希算法选择一个路由目标
     * @param message 要路由的消息
     * @returns 选择的目标PID，如果没有可用目标则返回null
     */
    route(message: MessageEnvelope): PID | null {
        if (!this.hasRoutees()) {
            log.warn('No routees available for consistent hash routing', { messageId: message.id });
            return null;
        }

        this.lookupCount++;
        const startTime = performance.now();

        // 计算消息的哈希值
        const hash = this.getHash(this.hashFunction(message));

        // 使用优化的二分查找在哈希环上找到节点
        const routee = this.findNodeOnRingOptimized(hash);

        const endTime = performance.now();
        this.totalLookupTime += (endTime - startTime);

        // 记录性能日志（每10000次查询）
        if (this.lookupCount % 10000 === 0) {
            log.debug('Consistent hash router performance', {
                averageLookupTimeMs: (this.totalLookupTime / this.lookupCount).toFixed(6),
                totalLookups: this.lookupCount,
                ringSize: this.sortedHashes.length
            });
        }

        return routee;
    }

    /**
     * 构建哈希环
     * 为每个实际节点创建多个虚拟节点，均匀分布在哈希环上
     */
    private buildHashRing(): void {
        const startTime = performance.now();

        // 清空当前哈希环
        this.hashRing.clear();
        this.sortedHashes = [];

        // 为每个路由目标创建虚拟节点
        for (const routee of this.routees) {
            for (let i = 0; i < this.virtualNodes; i++) {
                const virtualNode = `${routee.id}:${i}`;
                const hash = this.getHash(virtualNode);
                this.hashRing.set(hash, routee);
                this.sortedHashes.push(hash);
            }
        }

        // 预先排序哈希值数组以加速查找
        this.sortedHashes.sort((a, b) => a - b);

        const endTime = performance.now();
        log.debug('Rebuilt consistent hash ring', {
            routeeCount: this.routees.length,
            virtualNodeCount: this.sortedHashes.length,
            buildTimeMs: (endTime - startTime).toFixed(2)
        });
    }

    /**
     * 计算字符串或数字的哈希值
     * 使用简单的哈希函数，对于生产环境可能需要更复杂的哈希算法
     * @param value 要哈希的值
     * @returns 哈希值（0-2^32范围内）
     */
    private getHash(value: string | number): number {
        if (typeof value === 'number') {
            return Math.abs(value) % 0xFFFFFFFF; // 确保是正数且在32位整数范围内
        }

        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash);
    }

    /**
     * 使用二分查找算法在哈希环上查找给定哈希值对应的节点
     * 性能从O(n)提升到O(log n)
     * @param hash 要查找的哈希值
     * @returns 对应的路由目标
     */
    private findNodeOnRingOptimized(hash: number): PID {
        if (this.sortedHashes.length === 0) {
            // 这在正常情况下不应该发生，因为我们在route方法中已经检查了路由目标
            throw new Error('Consistent hash ring is empty');
        }

        // 二分查找优化
        let left = 0;
        let right = this.sortedHashes.length - 1;

        // 如果哈希值大于环上所有节点，返回第一个节点（环绕）
        if (hash > this.sortedHashes[right]) {
            return this.hashRing.get(this.sortedHashes[0])!;
        }

        // 二分查找第一个大于等于hash的节点
        while (left < right) {
            const mid = Math.floor((left + right) / 2);
            if (this.sortedHashes[mid] < hash) {
                left = mid + 1;
            } else {
                right = mid;
            }
        }

        return this.hashRing.get(this.sortedHashes[left])!;
    }

    /**
     * 原始的线性查找方法（保留作为比较）
     * @deprecated 使用findNodeOnRingOptimized替代
     */
    private findNodeOnRing(hash: number): PID {
        // 获取哈希环上所有哈希值并排序
        const keys = Array.from(this.hashRing.keys()).sort((a, b) => a - b);

        if (keys.length === 0) {
            throw new Error('Consistent hash ring is empty');
        }

        // 在环上找到大于或等于给定哈希值的第一个节点
        for (const key of keys) {
            if (key >= hash) {
                return this.hashRing.get(key)!;
            }
        }

        // 如果没有找到，则回到环的开始位置（环形结构）
        return this.hashRing.get(keys[0])!;
    }

    /**
     * 默认哈希函数，使用消息ID
     * @param message 消息
     * @returns 消息ID作为哈希基础
     */
    private defaultHashFunction(message: MessageEnvelope): string {
        return message.id;
    }
} 