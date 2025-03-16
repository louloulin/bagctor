/**
 * connection_pool.ts
 * 
 * HTTP连接池管理
 * 用于优化连接的建立和复用，提高性能
 */

import { IncomingMessage, ServerResponse, Server } from 'http';
import { Socket } from 'net';
import { createThreadLocal } from '../performance/thread_local';

/**
 * 连接状态
 */
export enum ConnectionState {
    IDLE = 'idle',         // 空闲状态
    ACTIVE = 'active',     // 活跃状态
    CLOSING = 'closing'    // 正在关闭
}

/**
 * 连接信息
 */
export interface ConnectionInfo {
    /**
     * 唯一ID
     */
    id: string;

    /**
     * 基础Socket
     */
    socket: Socket;

    /**
     * 创建时间
     */
    createdAt: number;

    /**
     * 最近活跃时间
     */
    lastActiveAt: number;

    /**
     * 处理的请求数
     */
    requestCount: number;

    /**
     * 当前状态
     */
    state: ConnectionState;

    /**
     * 是否保持活跃(Keep-Alive)
     */
    keepAlive: boolean;

    /**
     * 远程地址
     */
    remoteAddress: string;

    /**
     * 本地地址
     */
    localAddress: string;

    /**
     * 额外元数据
     */
    metadata: Map<string, any>;
}

/**
 * 连接池配置
 */
export interface ConnectionPoolOptions {
    /**
     * 最大空闲连接数
     */
    maxIdleConnections: number;

    /**
     * 连接最大存活时间(毫秒)
     */
    maxLifetime: number;

    /**
     * 空闲连接超时时间(毫秒)
     */
    idleTimeout: number;

    /**
     * 是否启用Keep-Alive
     */
    keepAlive: boolean;

    /**
     * Keep-Alive超时时间(毫秒)
     */
    keepAliveTimeout: number;

    /**
     * 是否启用连接预热
     */
    enablePrewarming: boolean;

    /**
     * 清理间隔(毫秒)
     */
    cleanupInterval: number;

    /**
     * 最大请求头大小(字节)
     */
    maxHeaderSize: number;

    /**
     * 日志级别
     */
    logLevel: 'debug' | 'info' | 'warn' | 'error' | 'none';
}

/**
 * 连接池统计信息
 */
export interface ConnectionPoolStats {
    /**
     * 当前活跃连接数
     */
    activeConnections: number;

    /**
     * 当前空闲连接数
     */
    idleConnections: number;

    /**
     * A总连接数
     */
    totalConnections: number;

    /**
     * 已创建的连接总数
     */
    createdConnections: number;

    /**
     * 已关闭的连接总数
     */
    closedConnections: number;

    /**
     * 连接错误总数
     */
    connectionErrors: number;

    /**
     * 连接复用总次数
     */
    connectionReuses: number;

    /**
     * 平均请求/连接数
     */
    averageRequestsPerConnection: number;
}

/**
 * HTTP连接池
 * 管理HTTP连接的生命周期和复用
 */
export class HttpConnectionPool {
    private options: ConnectionPoolOptions;
    private server: Server | null = null;
    private connections: Map<string, ConnectionInfo> = new Map();
    private idleConnections: Set<string> = new Set();
    private activeConnections: Set<string> = new Set();
    private cleanupTimer: NodeJS.Timeout | null = null;
    private stats: ConnectionPoolStats = {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        createdConnections: 0,
        closedConnections: 0,
        connectionErrors: 0,
        connectionReuses: 0,
        averageRequestsPerConnection: 0
    };

    // 线程本地变量，存储当前请求的连接信息
    private static currentConnection = createThreadLocal<ConnectionInfo | null>('currentConnection', null);

    /**
     * 构造函数
     * @param options 连接池配置
     */
    constructor(options?: Partial<ConnectionPoolOptions>) {
        // 默认配置
        this.options = {
            maxIdleConnections: 1000,
            maxLifetime: 30 * 60 * 1000, // 30分钟
            idleTimeout: 10 * 1000, // 10秒
            keepAlive: true,
            keepAliveTimeout: 5000, // 5秒
            enablePrewarming: false,
            cleanupInterval: 30000, // 30秒
            maxHeaderSize: 16 * 1024, // 16KB
            logLevel: 'info',
            ...options
        };

        this.log('debug', 'HTTP连接池已初始化');
    }

    /**
     * 将连接池绑定到HTTP服务器
     * @param server HTTP服务器实例
     */
    public attachToServer(server: Server): void {
        if (this.server) {
            throw new Error('连接池已经绑定到服务器');
        }

        this.server = server;

        // 处理新连接
        server.on('connection', (socket: Socket) => this.handleNewConnection(socket));

        // 处理请求
        server.on('request', (req: IncomingMessage, res: ServerResponse) => {
            this.handleRequest(req, res);
        });

        // 启动清理定时器
        this.startCleanupTimer();

        this.log('info', '连接池已绑定到HTTP服务器');
    }

    /**
     * 从服务器解绑连接池
     */
    public detachFromServer(): void {
        if (!this.server) {
            return;
        }

        // 停止清理定时器
        this.stopCleanupTimer();

        // 关闭所有连接
        this.closeAllConnections();

        this.server = null;

        this.log('info', '连接池已从HTTP服务器解绑');
    }

    /**
     * 获取当前请求的连接信息
     */
    public static getCurrentConnection(): ConnectionInfo | null {
        const conn = HttpConnectionPool.currentConnection.get();
        return conn ?? null;
    }

    /**
     * 获取连接池统计信息
     */
    public getStats(): ConnectionPoolStats {
        // 更新统计信息
        this.stats.activeConnections = this.activeConnections.size;
        this.stats.idleConnections = this.idleConnections.size;
        this.stats.totalConnections = this.connections.size;

        // 计算平均请求/连接
        if (this.stats.createdConnections > 0) {
            const totalRequests = Array.from(this.connections.values())
                .reduce((sum, conn) => sum + conn.requestCount, 0);
            this.stats.averageRequestsPerConnection = totalRequests / this.stats.createdConnections;
        }

        return { ...this.stats };
    }

    /**
     * 关闭所有连接
     */
    public closeAllConnections(): void {
        // 首先关闭所有空闲连接
        this.closeIdleConnections();

        // 然后关闭活跃连接
        for (const connId of this.activeConnections) {
            const conn = this.connections.get(connId);
            if (conn) {
                this.closeConnection(conn, '服务器关闭');
            }
        }

        this.log('info', `已关闭所有连接: ${this.stats.closedConnections}个`);
    }

    /**
     * 关闭空闲连接
     */
    public closeIdleConnections(): void {
        for (const connId of this.idleConnections) {
            const conn = this.connections.get(connId);
            if (conn) {
                this.closeConnection(conn, '空闲连接清理');
            }
        }

        this.idleConnections.clear();
    }

    /**
     * 设置Keep-Alive超时
     * @param timeout 超时时间(毫秒)
     */
    public setKeepAliveTimeout(timeout: number): void {
        this.options.keepAliveTimeout = timeout;
        this.log('info', `Keep-Alive超时已设置为: ${timeout}ms`);
    }

    /**
     * 预热连接池
     * @param count 预热连接数量
     */
    public prewarmConnections(count: number): void {
        if (!this.options.enablePrewarming) {
            this.log('info', '连接预热已禁用');
            return;
        }

        this.log('info', `正在预热 ${count} 个连接`);

        // 预热连接的实现依赖于具体场景
        // 这里只是一个占位符，实际实现可能需要配合特定的客户端

        this.log('info', '连接预热完成');
    }

    /**
     * 处理新连接
     * @param socket 网络套接字
     */
    private handleNewConnection(socket: Socket): void {
        // 生成唯一连接ID
        const connectionId = this.generateConnectionId(socket);

        // 创建连接信息
        const now = Date.now();
        const connectionInfo: ConnectionInfo = {
            id: connectionId,
            socket: socket,
            createdAt: now,
            lastActiveAt: now,
            requestCount: 0,
            state: ConnectionState.IDLE,
            keepAlive: this.options.keepAlive,
            remoteAddress: socket.remoteAddress || 'unknown',
            localAddress: socket.localAddress || 'unknown',
            metadata: new Map()
        };

        // 存储连接信息
        this.connections.set(connectionId, connectionInfo);
        this.idleConnections.add(connectionId);

        // 更新统计信息
        this.stats.createdConnections++;

        // 设置socket选项
        this.configureSocket(socket, connectionInfo);

        this.log('debug', `新连接已建立: ${connectionId}`);
    }

    /**
     * 处理HTTP请求
     * @param req 请求对象
     * @param res 响应对象
     */
    private handleRequest(req: IncomingMessage, res: ServerResponse): void {
        // 获取socket
        const socket = req.socket;
        const connectionId = this.getConnectionIdFromSocket(socket);

        if (!connectionId) {
            this.log('warn', '收到未知连接的请求');
            return;
        }

        // 获取连接信息
        const connectionInfo = this.connections.get(connectionId);
        if (!connectionInfo) {
            this.log('warn', `未找到连接信息: ${connectionId}`);
            return;
        }

        // 更新连接状态
        connectionInfo.state = ConnectionState.ACTIVE;
        connectionInfo.lastActiveAt = Date.now();
        connectionInfo.requestCount++;

        // 从空闲集合移动到活跃集合
        this.idleConnections.delete(connectionId);
        this.activeConnections.add(connectionId);

        // 存储当前请求的连接信息在线程本地存储中
        HttpConnectionPool.currentConnection.set(connectionInfo);

        // 如果这是复用的连接，更新统计信息
        if (connectionInfo.requestCount > 1) {
            this.stats.connectionReuses++;
        }

        // 处理请求完成
        res.on('finish', () => this.handleRequestFinished(connectionInfo, req, res));

        this.log('debug', `处理请求: ${req.method} ${req.url} (连接: ${connectionId})`);
    }

    /**
     * 处理请求完成
     * @param connectionInfo 连接信息
     * @param req 请求对象
     * @param res 响应对象
     */
    private handleRequestFinished(connectionInfo: ConnectionInfo, req: IncomingMessage, res: ServerResponse): void {
        // 清除线程本地存储
        HttpConnectionPool.currentConnection.set(null);

        // 检查是否保持连接
        const keepAlive = this.shouldKeepAlive(req, res);

        if (keepAlive && this.options.keepAlive) {
            // 将连接移回空闲池
            connectionInfo.state = ConnectionState.IDLE;
            this.activeConnections.delete(connectionInfo.id);
            this.idleConnections.add(connectionInfo.id);

            // 设置Keep-Alive超时
            connectionInfo.socket.setTimeout(this.options.keepAliveTimeout, () => {
                this.log('debug', `Keep-Alive超时: ${connectionInfo.id}`);
                this.closeConnection(connectionInfo, 'Keep-Alive超时');
            });

            this.log('debug', `请求完成，保持连接: ${connectionInfo.id}`);
        } else {
            // 请求完成后关闭连接
            this.log('debug', `请求完成，关闭连接: ${connectionInfo.id}`);
            this.closeConnection(connectionInfo, '请求完成');
        }
    }

    /**
     * 检查是否应该保持连接
     * @param req 请求对象
     * @param res 响应对象
     */
    private shouldKeepAlive(req: IncomingMessage, res: ServerResponse): boolean {
        // 检查请求头中的Connection
        const connection = req.headers.connection?.toLowerCase();

        // HTTP 1.0默认关闭连接，除非显式指定keep-alive
        if (req.httpVersion === '1.0') {
            return connection === 'keep-alive';
        }

        // HTTP 1.1默认保持连接，除非显式指定close
        return connection !== 'close';
    }

    /**
     * 配置Socket
     * @param socket 网络套接字
     * @param connectionInfo 连接信息
     */
    private configureSocket(socket: Socket, connectionInfo: ConnectionInfo): void {
        // 设置Keep-Alive
        socket.setKeepAlive(this.options.keepAlive, this.options.keepAliveTimeout);

        // 设置TCP_NODELAY（禁用Nagle算法，减少延迟）
        socket.setNoDelay(true);

        // 监听错误事件
        socket.on('error', (error) => {
            this.log('error', `连接错误 ${connectionInfo.id}: ${error.message}`);
            this.stats.connectionErrors++;
            this.closeConnection(connectionInfo, `错误: ${error.message}`);
        });

        // 监听关闭事件
        socket.on('close', () => {
            this.handleSocketClose(connectionInfo);
        });
    }

    /**
     * 处理Socket关闭
     * @param connectionInfo 连接信息
     */
    private handleSocketClose(connectionInfo: ConnectionInfo): void {
        // 从活跃和空闲集合中移除
        this.activeConnections.delete(connectionInfo.id);
        this.idleConnections.delete(connectionInfo.id);

        // 从连接映射中移除
        this.connections.delete(connectionInfo.id);

        this.log('debug', `连接已关闭: ${connectionInfo.id}`);
    }

    /**
     * 关闭指定连接
     * @param connectionInfo 连接信息
     * @param reason 关闭原因
     */
    private closeConnection(connectionInfo: ConnectionInfo, reason: string): void {
        if (connectionInfo.state === ConnectionState.CLOSING) {
            return;
        }

        connectionInfo.state = ConnectionState.CLOSING;

        try {
            // 关闭Socket
            connectionInfo.socket.end();
            connectionInfo.socket.destroy();

            // 更新统计信息
            this.stats.closedConnections++;

            this.log('debug', `连接关闭 ${connectionInfo.id}: ${reason}`);
        } catch (error) {
            this.log('error', `关闭连接错误 ${connectionInfo.id}: ${error}`);
        }

        // 从集合中移除连接
        this.activeConnections.delete(connectionInfo.id);
        this.idleConnections.delete(connectionInfo.id);
        this.connections.delete(connectionInfo.id);
    }

    /**
     * 生成连接ID
     * @param socket 网络套接字
     */
    private generateConnectionId(socket: Socket): string {
        const remoteAddr = socket.remoteAddress || 'unknown';
        const remotePort = socket.remotePort || 0;
        const localAddr = socket.localAddress || 'unknown';
        const localPort = socket.localPort || 0;
        const timestamp = Date.now();

        return `${remoteAddr}:${remotePort}-${localAddr}:${localPort}-${timestamp}`;
    }

    /**
     * 从Socket获取连接ID
     * @param socket 网络套接字
     */
    private getConnectionIdFromSocket(socket: Socket): string | null {
        // 查找匹配的连接
        for (const [id, conn] of this.connections.entries()) {
            if (conn.socket === socket) {
                return id;
            }
        }
        return null;
    }

    /**
     * 启动清理定时器
     */
    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            return;
        }

        this.cleanupTimer = setInterval(() => {
            this.cleanupConnections();
        }, this.options.cleanupInterval) as unknown as NodeJS.Timeout;

        this.log('debug', `清理定时器已启动，间隔: ${this.options.cleanupInterval}ms`);
    }

    /**
     * 停止清理定时器
     */
    private stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            this.log('debug', '清理定时器已停止');
        }
    }

    /**
     * 清理过期和空闲的连接
     */
    private cleanupConnections(): void {
        const now = Date.now();
        let expiredCount = 0;
        let idleCount = 0;

        // 检查空闲连接
        for (const connId of this.idleConnections) {
            const conn = this.connections.get(connId);
            if (!conn) continue;

            // 检查最大存活时间
            const lifetime = now - conn.createdAt;
            if (lifetime > this.options.maxLifetime) {
                this.closeConnection(conn, '超过最大存活时间');
                expiredCount++;
                continue;
            }

            // 检查空闲超时
            const idleTime = now - conn.lastActiveAt;
            if (idleTime > this.options.idleTimeout) {
                this.closeConnection(conn, '空闲超时');
                idleCount++;
            }
        }

        // 检查是否超过最大空闲连接数
        if (this.idleConnections.size > this.options.maxIdleConnections) {
            // 关闭多余的空闲连接
            const excessCount = this.idleConnections.size - this.options.maxIdleConnections;
            let closedCount = 0;

            // 按照最后活跃时间排序，关闭最不活跃的连接
            const sortedIdle = Array.from(this.idleConnections)
                .map(id => this.connections.get(id)!)
                .sort((a, b) => a.lastActiveAt - b.lastActiveAt);

            for (let i = 0; i < excessCount && i < sortedIdle.length; i++) {
                this.closeConnection(sortedIdle[i], '超过最大空闲连接数');
                closedCount++;
            }

            if (closedCount > 0) {
                this.log('debug', `关闭 ${closedCount} 个多余的空闲连接`);
            }
        }

        if (expiredCount > 0 || idleCount > 0) {
            this.log('debug', `清理连接: ${expiredCount} 个过期, ${idleCount} 个空闲超时`);
        }
    }

    /**
     * 输出日志
     * @param level 日志级别
     * @param message 日志消息
     */
    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        const levels = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

        if (levels[level] >= levels[this.options.logLevel]) {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [HttpConnectionPool] [${level.toUpperCase()}] ${message}`);
        }
    }
}

/**
 * 获取当前HTTP请求的连接信息
 */
export function getCurrentConnection(): ConnectionInfo | null {
    return HttpConnectionPool.getCurrentConnection();
}

/**
 * 创建HTTP连接池
 * @param options 连接池配置
 */
export function createConnectionPool(options?: Partial<ConnectionPoolOptions>): HttpConnectionPool {
    return new HttpConnectionPool(options);
} 