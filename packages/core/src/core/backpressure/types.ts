import { MessageEnvelope } from '../messaging/types';

/**
 * 背压策略枚举，定义不同的背压处理方式
 */
export enum BackpressureStrategy {
    /** 丢弃新消息 */
    DROP_NEW = 'drop-new',
    /** 丢弃旧消息 */
    DROP_OLD = 'drop-old',
    /** 抛出异常 */
    THROW = 'throw',
    /** 等待队列空间 (阻塞) */
    WAIT = 'wait'
}

/**
 * 背压控制器配置
 */
export interface BackpressureConfig {
    /** 最大队列容量 */
    maxQueueSize: number;
    /** 高水位线百分比 (0-1)，达到此水位时启动背压 */
    highWatermark: number;
    /** 低水位线百分比 (0-1)，降到此水位时停止背压 */
    lowWatermark: number;
    /** 背压策略 */
    strategy: BackpressureStrategy;
    /** 等待超时时间（毫秒），仅在 WAIT 策略下使用 */
    waitTimeout?: number;
}

/**
 * 背压控制器接口
 */
export interface BackpressureController {
    /**
     * 提交消息到控制器，可能会根据背压策略被拒绝或阻塞
     * @param message 要处理的消息
     * @returns 如果消息被接受则返回 true，被拒绝则返回 false
     */
    submit(message: MessageEnvelope): Promise<boolean>;

    /**
     * 获取下一个要处理的消息
     * @returns 下一个消息，如果队列为空则返回 null
     */
    next(): Promise<MessageEnvelope | null>;

    /**
     * 标记一个消息处理完成
     * @param messageId 处理完成的消息ID
     */
    complete(messageId: string): void;

    /**
     * 获取当前队列大小
     */
    getQueueSize(): number;

    /**
     * 检查背压是否激活
     */
    isBackpressureActive(): boolean;

    /**
     * 获取队列使用率（0-1）
     */
    getQueueUtilization(): number;
} 