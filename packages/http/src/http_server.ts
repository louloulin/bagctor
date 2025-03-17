import { ActorSystem } from "@bactor/core";
import { OptimizedHttpServerActor } from "./core/server/optimized_http_server";
import { AdaptiveHttpServerActor } from "./core/server/adaptive_http_server";

/**
 * HTTP服务器配置选项
 */
export interface HttpServerOptions {
    /**
     * 服务器端口
     */
    port?: number;

    /**
     * 主机名
     */
    hostname?: string;

    /**
     * TLS配置（用于HTTPS）
     */
    tls?: {
        cert: string;
        key: string;
    };

    /**
     * 服务器类型
     * - adaptive: 自适应服务器，根据负载自动调整资源
     * - optimized: 优化服务器，专注于性能
     */
    type?: 'adaptive' | 'optimized';

    /**
     * 调试模式
     */
    debug?: boolean;

    /**
     * 反应器池大小
     * 设置为0将使用系统可用CPU核心数
     */
    reactorPoolSize?: number;
}

/**
 * 创建HTTP服务器
 * @param system Actor系统
 * @param options 服务器配置选项
 * @returns 服务器Actor引用
 */
export function createHttpServer(system: ActorSystem, options: HttpServerOptions = {}) {
    // 默认为自适应服务器
    const serverType = options.type || 'adaptive';

    if (serverType === 'adaptive') {
        return AdaptiveHttpServerActor.create(system, options);
    } else {
        return OptimizedHttpServerActor.create(system, options);
    }
} 