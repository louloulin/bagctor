import { MetricRegistry, Metric, MetricType } from '../metrics/collector';
import { log } from '@utils/logger';

export interface DashboardConfig {
    enabled: boolean;
    port: number;
    path: string;
    updateInterval: number;
    allowCors: boolean;
    requireAuth: boolean;
    username?: string;
    password?: string;
}

// 简单的HTTP服务器，用于提供监控仪表板
export class DashboardServer {
    private config: DashboardConfig;
    private registry: MetricRegistry;
    private server: any;
    private updateInterval?: NodeJS.Timeout;
    private cachedMetrics: any = {};
    private http: any;

    constructor(config: DashboardConfig) {
        this.registry = MetricRegistry.getInstance();
        this.config = {
            ...config,
            enabled: config.enabled ?? true,
            port: config.port ?? 8080,
            path: config.path ?? '/metrics',
            updateInterval: config.updateInterval ?? 5000,
            allowCors: config.allowCors ?? true,
            requireAuth: config.requireAuth ?? false
        };

        // 动态导入模块
        try {
            this.http = require('http');
        } catch (error) {
            throw new Error('Failed to import http module');
        }

        log.info(`Dashboard server initialized with port: ${this.config.port}`);
    }

    // 启动仪表板服务器
    start(): void {
        if (!this.config.enabled) {
            log.info('Dashboard server is disabled');
            return;
        }

        this.startMetricsUpdate();
        this.startHttpServer();
        log.info(`Dashboard server started on port ${this.config.port}`);
    }

    // 停止仪表板服务器
    stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }

        if (this.server) {
            this.server.close();
            this.server = undefined;
            log.info('Dashboard server stopped');
        }
    }

    // 启动定期指标更新
    private startMetricsUpdate(): void {
        // 立即更新一次
        this.updateMetrics();

        // 设置定期更新
        this.updateInterval = setInterval(() => {
            this.updateMetrics();
        }, this.config.updateInterval) as unknown as NodeJS.Timeout;
    }

    // 更新指标缓存
    private updateMetrics(): void {
        const metrics = this.registry.getAllMetrics();
        const timestamp = Date.now();

        // 格式化所有指标
        const formattedMetrics = metrics.map(metric => this.formatMetric(metric));

        // 按类型分组
        const byType: Record<string, any[]> = {};
        formattedMetrics.forEach(metric => {
            if (!byType[metric.type]) {
                byType[metric.type] = [];
            }
            byType[metric.type].push(metric);
        });

        // 更新缓存
        this.cachedMetrics = {
            metrics: formattedMetrics,
            byType,
            timestamp,
            count: formattedMetrics.length
        };

        log.debug(`Updated metrics cache with ${formattedMetrics.length} metrics`);
    }

    // 格式化单个指标
    private formatMetric(metric: Metric): any {
        const value = metric.getValue();
        const formattedValue = this.formatValue(metric.type, value);

        return {
            name: metric.name,
            help: metric.help,
            type: metric.type,
            tags: metric.tags,
            value: formattedValue,
            timestamp: Date.now()
        };
    }

    // 根据类型格式化指标值
    private formatValue(type: MetricType, value: any): any {
        switch (type) {
            case MetricType.COUNTER:
            case MetricType.GAUGE:
                return value;
            case MetricType.HISTOGRAM:
                return {
                    buckets: Array.from(value.buckets.entries()).map((entry) => {
                        const [bucket, count] = entry as [number, number];
                        return { bucket, count };
                    }),
                    sum: value.sum,
                    count: value.count
                };
            case MetricType.METER:
                return {
                    m1Rate: value.m1Rate,
                    m5Rate: value.m5Rate,
                    m15Rate: value.m15Rate,
                    meanRate: value.meanRate
                };
            default:
                return value;
        }
    }

    // 启动HTTP服务器
    private startHttpServer(): void {
        this.server = this.http.createServer((req: any, res: any) => {
            // 处理CORS
            if (this.config.allowCors) {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

                if (req.method === 'OPTIONS') {
                    res.writeHead(204);
                    res.end();
                    return;
                }
            }

            // 仅支持GET请求
            if (req.method !== 'GET') {
                res.writeHead(405, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Method not allowed' }));
                return;
            }

            // 检查认证
            if (this.config.requireAuth) {
                const authHeader = req.headers.authorization || '';
                if (!this.checkAuth(authHeader)) {
                    res.writeHead(401, {
                        'Content-Type': 'application/json',
                        'WWW-Authenticate': 'Basic realm="Metrics Dashboard"'
                    });
                    res.end(JSON.stringify({ error: 'Authentication required' }));
                    return;
                }
            }

            // 路由请求
            this.routeRequest(req, res);
        });

        // 监听端口
        this.server.listen(this.config.port, () => {
            log.info(`Dashboard server listening on port ${this.config.port}`);
        });

        // 错误处理
        this.server.on('error', (error: Error) => {
            log.error('Dashboard server error:', error);
        });
    }

    // 检查认证
    private checkAuth(authHeader: string): boolean {
        if (!this.config.requireAuth) {
            return true;
        }

        if (!this.config.username || !this.config.password) {
            log.warn('Authentication required but no credentials configured');
            return false;
        }

        if (!authHeader.startsWith('Basic ')) {
            return false;
        }

        try {
            const base64Credentials = authHeader.slice(6);
            const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
            const [username, password] = credentials.split(':');

            return username === this.config.username && password === this.config.password;
        } catch (error) {
            log.error('Authentication error:', error);
            return false;
        }
    }

    // 路由请求
    private routeRequest(req: any, res: any): void {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;

        // 指标API
        if (path === this.config.path) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(this.cachedMetrics));
            return;
        }

        // 特定类型的指标
        const typeMatch = path.match(new RegExp(`${this.config.path}/type/([a-z]+)$`));
        if (typeMatch) {
            const type = typeMatch[1];
            const metrics = this.cachedMetrics.byType[type] || [];

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                metrics,
                timestamp: this.cachedMetrics.timestamp,
                count: metrics.length
            }));
            return;
        }

        // 特定名称的指标
        const nameMatch = path.match(new RegExp(`${this.config.path}/name/([\\w.]+)$`));
        if (nameMatch) {
            const name = nameMatch[1];
            const metric = this.cachedMetrics.metrics.find((m: any) => m.name === name);

            if (metric) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(metric));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Metric ${name} not found` }));
            }
            return;
        }

        // 健康检查端点
        if (path === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                timestamp: Date.now(),
                metricsCount: this.cachedMetrics.count
            }));
            return;
        }

        // 默认响应是404
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
} 