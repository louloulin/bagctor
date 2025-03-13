import type { Describe, Test } from "bun:test";
import { CustomReporter } from "./src/test/reporter";

const config = {
    // 只在测试失败时显示完整的堆栈跟踪
    stackTrace: false,
    // 超时时间设置为5秒
    timeout: 5000,
    // 使用点号显示测试进度
    stylize: true,
    // 按文件分组显示测试结果
    preload: ["./src/test/setup.ts"],
    // 并发运行测试
    concurrent: true,
    // 显示测试覆盖率
    coverage: {
        enabled: true,
        summary: true,
        functions: true,
        lines: true,
        branches: true
    },
    // 使用自定义报告器
    reporter: (runner: any) => new CustomReporter(runner)
};

export default config; 