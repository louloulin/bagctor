import { beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { log } from "../utils/logger";

// 禁用测试期间的常规日志输出
beforeAll(() => {
    // 保存原始的日志级别
    const originalLogLevel = log.level;

    // 设置更高的日志级别，只显示错误
    log.level = "error";

    // 测试完成后恢复
    afterAll(() => {
        log.level = originalLogLevel;
    });
});

// 在每个测试之前清理环境
beforeEach(async () => {
    // 可以添加其他清理逻辑
});

// 在每个测试之后清理
afterEach(async () => {
    // 可以添加其他清理逻辑
}); 