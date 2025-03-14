// 消息调度器接口
export interface MessageDispatcher {
    /**
     * 调度任务执行
     * @param task 要执行的任务函数
     */
    schedule(task: () => Promise<void>): void;

    /**
     * 关闭调度器
     */
    shutdown(): void;
}

// 导出其他接口
// ... existing code ... 