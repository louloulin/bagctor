import { MetricRegistry, Metric, MetricType, Counter, Gauge, Histogram, Meter } from './collector';
import { log } from '../../../utils/logger';

// 报告格式
export enum ReportFormat {
    JSON = 'json',
    PROMETHEUS = 'prometheus',
    INFLUXDB = 'influxdb'
}

// 报告配置
export interface ReporterConfig {
    enabled: boolean;
    reportingIntervalMs: number;
    format: ReportFormat;
    outputPath?: string;
    additionalTags?: { [key: string]: string };
}

// 指标快照
export interface MetricSnapshot {
    name: string;
    help: string;
    type: MetricType;
    tags: { [key: string]: string };
    value: any;
    timestamp: number;
}

// 报告器接口
export interface Reporter {
    start(): void;
    stop(): void;
    report(): Promise<void>;
    setAdditionalTags(tags: { [key: string]: string }): void;
}

// 控制台报告器
export class ConsoleReporter implements Reporter {
    private registry: MetricRegistry;
    private config: ReporterConfig;
    private intervalId?: NodeJS.Timeout;

    constructor(config: ReporterConfig) {
        this.registry = MetricRegistry.getInstance();
        this.config = {
            ...config,
            format: config.format || ReportFormat.JSON
        };
        log.info(`Console reporter initialized with format: ${this.config.format}`);
    }

    start(): void {
        if (!this.config.enabled) {
            log.info('Console reporter is disabled');
            return;
        }

        this.intervalId = setInterval(() => {
            this.report().catch(err => {
                log.error('Error reporting metrics:', err);
            });
        }, this.config.reportingIntervalMs);

        log.info(`Console reporter started with interval: ${this.config.reportingIntervalMs}ms`);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            log.info('Console reporter stopped');
        }
    }

    async report(): Promise<void> {
        const metrics = this.registry.getAllMetrics();
        const snapshots = metrics.map(metric => this.createSnapshot(metric));

        if (snapshots.length === 0) {
            log.debug('No metrics to report');
            return;
        }

        switch (this.config.format) {
            case ReportFormat.JSON:
                this.reportJson(snapshots);
                break;
            case ReportFormat.PROMETHEUS:
                this.reportPrometheus(snapshots);
                break;
            case ReportFormat.INFLUXDB:
                this.reportInfluxDb(snapshots);
                break;
            default:
                log.warn(`Unsupported format: ${this.config.format}`);
        }
    }

    setAdditionalTags(tags: { [key: string]: string }): void {
        this.config.additionalTags = { ...this.config.additionalTags, ...tags };
    }

    private createSnapshot(metric: Metric): MetricSnapshot {
        return {
            name: metric.name,
            help: metric.help,
            type: metric.type,
            tags: { ...metric.tags, ...this.config.additionalTags },
            value: metric.getValue(),
            timestamp: Date.now()
        };
    }

    private reportJson(snapshots: MetricSnapshot[]): void {
        const json = JSON.stringify(snapshots, null, 2);
        log.info(`Metrics Report (JSON): ${json}`);
    }

    private reportPrometheus(snapshots: MetricSnapshot[]): void {
        let output = '';

        for (const snapshot of snapshots) {
            // 添加帮助信息和类型
            output += `# HELP ${snapshot.name} ${snapshot.help}\n`;
            output += `# TYPE ${snapshot.name} ${snapshot.type}\n`;

            // 处理不同类型的指标
            switch (snapshot.type) {
                case MetricType.COUNTER:
                    output += this.formatPrometheusMetric(snapshot.name, snapshot.tags, snapshot.value);
                    break;
                case MetricType.GAUGE:
                    output += this.formatPrometheusMetric(snapshot.name, snapshot.tags, snapshot.value);
                    break;
                case MetricType.HISTOGRAM:
                    const histValue = snapshot.value as { buckets: Map<number, number>; sum: number; count: number };

                    // 输出桶
                    for (const [boundary, count] of histValue.buckets.entries()) {
                        const bucketName = boundary === Infinity ? `${snapshot.name}_bucket{le="+Inf"` : `${snapshot.name}_bucket{le="${boundary}"`;
                        output += this.formatPrometheusMetric(bucketName, snapshot.tags, count, true);
                    }

                    // 输出总和和计数
                    output += this.formatPrometheusMetric(`${snapshot.name}_sum`, snapshot.tags, histValue.sum);
                    output += this.formatPrometheusMetric(`${snapshot.name}_count`, snapshot.tags, histValue.count);
                    break;
                case MetricType.METER:
                    const meterValue = snapshot.value as { m1Rate: number; m5Rate: number; m15Rate: number; meanRate: number };
                    output += this.formatPrometheusMetric(`${snapshot.name}_m1`, snapshot.tags, meterValue.m1Rate);
                    output += this.formatPrometheusMetric(`${snapshot.name}_m5`, snapshot.tags, meterValue.m5Rate);
                    output += this.formatPrometheusMetric(`${snapshot.name}_m15`, snapshot.tags, meterValue.m15Rate);
                    output += this.formatPrometheusMetric(`${snapshot.name}_mean`, snapshot.tags, meterValue.meanRate);
                    break;
            }
        }

        log.info(`Metrics Report (Prometheus):\n${output}`);
    }

    private formatPrometheusMetric(
        name: string,
        tags: { [key: string]: string },
        value: number,
        skipTagOpening: boolean = false
    ): string {
        // 转换标签
        let tagStr = '';
        if (!skipTagOpening && Object.keys(tags).length > 0) {
            tagStr += '{';
        } else if (skipTagOpening && Object.keys(tags).length > 0) {
            tagStr += ',';
        }

        tagStr += Object.entries(tags)
            .map(([key, val]) => `${key}="${val}"`)
            .join(',');

        if (!skipTagOpening && Object.keys(tags).length > 0) {
            tagStr += '}';
        }

        return `${name}${tagStr} ${value}\n`;
    }

    private reportInfluxDb(snapshots: MetricSnapshot[]): void {
        let output = '';

        for (const snapshot of snapshots) {
            const tags = Object.entries(snapshot.tags)
                .map(([key, val]) => `${key}=${val}`)
                .join(',');

            let fields = '';

            switch (snapshot.type) {
                case MetricType.COUNTER:
                case MetricType.GAUGE:
                    fields = `value=${snapshot.value}`;
                    break;
                case MetricType.HISTOGRAM:
                    const histValue = snapshot.value as { buckets: Map<number, number>; sum: number; count: number };
                    fields = `sum=${histValue.sum},count=${histValue.count}`;

                    Array.from(histValue.buckets.entries()).forEach(([boundary, count]) => {
                        const bucketName = boundary === Infinity ? 'inf' : boundary.toString();
                        fields += `,bucket_${bucketName}=${count}`;
                    });
                    break;
                case MetricType.METER:
                    const meterValue = snapshot.value as { m1Rate: number; m5Rate: number; m15Rate: number; meanRate: number };
                    fields = `m1=${meterValue.m1Rate},m5=${meterValue.m5Rate},m15=${meterValue.m15Rate},mean=${meterValue.meanRate}`;
                    break;
            }

            output += `${snapshot.name}${tags ? ',' + tags : ''} ${fields} ${snapshot.timestamp}\n`;
        }

        log.info(`Metrics Report (InfluxDB):\n${output}`);
    }
}

// 文件报告器
export class FileReporter implements Reporter {
    private registry: MetricRegistry;
    private config: ReporterConfig;
    private intervalId?: NodeJS.Timeout;
    private fs: any;

    constructor(config: ReporterConfig) {
        this.registry = MetricRegistry.getInstance();
        this.config = {
            ...config,
            format: config.format || ReportFormat.JSON
        };

        if (!this.config.outputPath) {
            throw new Error('Output path is required for FileReporter');
        }

        // 动态导入fs模块
        try {
            this.fs = require('fs');
        } catch (error) {
            throw new Error('Failed to import fs module');
        }

        log.info(`File reporter initialized with format: ${this.config.format} and output path: ${this.config.outputPath}`);
    }

    start(): void {
        if (!this.config.enabled) {
            log.info('File reporter is disabled');
            return;
        }

        this.intervalId = setInterval(() => {
            this.report().catch(err => {
                log.error('Error reporting metrics to file:', err);
            });
        }, this.config.reportingIntervalMs);

        log.info(`File reporter started with interval: ${this.config.reportingIntervalMs}ms`);
    }

    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
            log.info('File reporter stopped');
        }
    }

    async report(): Promise<void> {
        const metrics = this.registry.getAllMetrics();
        const snapshots = metrics.map(metric => this.createSnapshot(metric));

        if (snapshots.length === 0) {
            log.debug('No metrics to report to file');
            return;
        }

        let output = '';
        switch (this.config.format) {
            case ReportFormat.JSON:
                output = JSON.stringify(snapshots, null, 2);
                break;
            case ReportFormat.PROMETHEUS:
                output = this.formatPrometheusOutput(snapshots);
                break;
            case ReportFormat.INFLUXDB:
                output = this.formatInfluxDbOutput(snapshots);
                break;
            default:
                log.warn(`Unsupported format: ${this.config.format}`);
                return;
        }

        try {
            if (!this.config.outputPath) {
                throw new Error('Output path is not defined');
            }
            await this.writeToFile(this.config.outputPath, output);
            log.debug(`Metrics written to ${this.config.outputPath}`);
        } catch (error) {
            log.error(`Failed to write metrics to ${this.config.outputPath}:`, error);
        }
    }

    setAdditionalTags(tags: { [key: string]: string }): void {
        this.config.additionalTags = { ...this.config.additionalTags, ...tags };
    }

    private createSnapshot(metric: Metric): MetricSnapshot {
        return {
            name: metric.name,
            help: metric.help,
            type: metric.type,
            tags: { ...metric.tags, ...this.config.additionalTags },
            value: metric.getValue(),
            timestamp: Date.now()
        };
    }

    private formatPrometheusOutput(snapshots: MetricSnapshot[]): string {
        // 重用ConsoleReporter的Prometheus格式化功能
        const reporter = new ConsoleReporter({
            ...this.config,
            enabled: true,
            reportingIntervalMs: 0
        });

        // 使用内部的reportPrometheus方法
        const originalLog = log.info;
        let output = '';
        log.info = (message: string) => { output = message.replace('Metrics Report (Prometheus):\n', ''); };
        reporter.reportPrometheus(snapshots);
        log.info = originalLog;

        return output;
    }

    private formatInfluxDbOutput(snapshots: MetricSnapshot[]): string {
        // 重用ConsoleReporter的InfluxDB格式化功能
        const reporter = new ConsoleReporter({
            ...this.config,
            enabled: true,
            reportingIntervalMs: 0
        });

        // 使用内部的reportInfluxDb方法
        const originalLog = log.info;
        let output = '';
        log.info = (message: string) => { output = message.replace('Metrics Report (InfluxDB):\n', ''); };
        reporter.reportInfluxDb(snapshots);
        log.info = originalLog;

        return output;
    }

    private async writeToFile(filePath: string, content: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.fs.writeFile(filePath, content, (err: Error) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

// 报告器管理器
export class ReporterManager {
    private reporters: Reporter[] = [];
    private static instance: ReporterManager;

    // 单例模式
    static getInstance(): ReporterManager {
        if (!ReporterManager.instance) {
            ReporterManager.instance = new ReporterManager();
        }
        return ReporterManager.instance;
    }

    private constructor() {
        log.info('Initializing reporter manager');
    }

    addReporter(reporter: Reporter): void {
        this.reporters.push(reporter);
    }

    startAll(): void {
        for (const reporter of this.reporters) {
            reporter.start();
        }
    }

    stopAll(): void {
        for (const reporter of this.reporters) {
            reporter.stop();
        }
    }

    async reportAll(): Promise<void> {
        for (const reporter of this.reporters) {
            await reporter.report();
        }
    }

    setAdditionalTags(tags: { [key: string]: string }): void {
        for (const reporter of this.reporters) {
            reporter.setAdditionalTags(tags);
        }
    }
} 