import { log } from '@utils/logger';

// 指标类型
export enum MetricType {
    COUNTER = 'counter',
    GAUGE = 'gauge',
    HISTOGRAM = 'histogram',
    METER = 'meter'
}

// 指标标签
export interface MetricTags {
    [key: string]: string;
}

// 指标基类
export abstract class Metric {
    readonly name: string;
    readonly help: string;
    readonly type: MetricType;
    readonly tags: MetricTags;

    constructor(name: string, help: string, type: MetricType, tags: MetricTags = {}) {
        this.name = name;
        this.help = help;
        this.type = type;
        this.tags = tags;
    }

    abstract getValue(): any;
    abstract reset(): void;
}

// 计数器指标
export class Counter extends Metric {
    private value: number = 0;

    constructor(name: string, help: string, tags: MetricTags = {}) {
        super(name, help, MetricType.COUNTER, tags);
    }

    inc(value: number = 1): void {
        if (value < 0) {
            throw new Error('Counter cannot be decremented');
        }
        this.value += value;
    }

    getValue(): number {
        return this.value;
    }

    reset(): void {
        this.value = 0;
    }
}

// 仪表指标
export class Gauge extends Metric {
    private value: number = 0;

    constructor(name: string, help: string, tags: MetricTags = {}) {
        super(name, help, MetricType.GAUGE, tags);
    }

    set(value: number): void {
        this.value = value;
    }

    inc(value: number = 1): void {
        this.value += value;
    }

    dec(value: number = 1): void {
        this.value -= value;
    }

    getValue(): number {
        return this.value;
    }

    reset(): void {
        this.value = 0;
    }
}

// 直方图指标
export class Histogram extends Metric {
    private buckets: Map<number, number> = new Map();
    private sum: number = 0;
    private count: number = 0;

    constructor(
        name: string,
        help: string,
        private readonly bucketBoundaries: number[],
        tags: MetricTags = {}
    ) {
        super(name, help, MetricType.HISTOGRAM, tags);
        // 初始化所有区间
        for (const boundary of bucketBoundaries) {
            this.buckets.set(boundary, 0);
        }
        // 添加无穷大区间
        this.buckets.set(Infinity, 0);
    }

    observe(value: number): void {
        this.sum += value;
        this.count++;

        // 更新区间计数
        for (const boundary of [
            ...this.bucketBoundaries,
            Infinity
        ].sort((a, b) => a - b)) {
            if (value <= boundary) {
                const currentCount = this.buckets.get(boundary) || 0;
                this.buckets.set(boundary, currentCount + 1);
            }
        }
    }

    getValue(): { buckets: Map<number, number>; sum: number; count: number } {
        return {
            buckets: this.buckets,
            sum: this.sum,
            count: this.count
        };
    }

    reset(): void {
        this.sum = 0;
        this.count = 0;
        for (const boundary of this.buckets.keys()) {
            this.buckets.set(boundary, 0);
        }
    }
}

// 速率指标
export class Meter extends Metric {
    private count: number = 0;
    private startTime: number;
    private lastUpdateTime: number;
    private m1Rate: number = 0;
    private m5Rate: number = 0;
    private m15Rate: number = 0;

    // 衰减常数
    private static readonly M1_ALPHA = 1 - Math.exp(-5 / 60);
    private static readonly M5_ALPHA = 1 - Math.exp(-5 / 60 / 5);
    private static readonly M15_ALPHA = 1 - Math.exp(-5 / 60 / 15);

    constructor(name: string, help: string, tags: MetricTags = {}) {
        super(name, help, MetricType.METER, tags);
        this.startTime = Date.now();
        this.lastUpdateTime = this.startTime;
    }

    mark(n: number = 1): void {
        this.count += n;
        this.updateRates();
    }

    private updateRates(): void {
        const now = Date.now();
        const interval = (now - this.lastUpdateTime) / 1000;

        if (interval === 0) return;

        const instantRate = this.count / interval;

        this.m1Rate = this.calculateExponentialDecay(this.m1Rate, instantRate, Meter.M1_ALPHA, interval);
        this.m5Rate = this.calculateExponentialDecay(this.m5Rate, instantRate, Meter.M5_ALPHA, interval);
        this.m15Rate = this.calculateExponentialDecay(this.m15Rate, instantRate, Meter.M15_ALPHA, interval);

        this.count = 0;
        this.lastUpdateTime = now;
    }

    private calculateExponentialDecay(rate: number, instantRate: number, alpha: number, interval: number): number {
        return rate + alpha * (instantRate - rate) * interval;
    }

    getValue(): { m1Rate: number; m5Rate: number; m15Rate: number; meanRate: number } {
        this.updateRates();

        const meanRate = this.count / ((Date.now() - this.startTime) / 1000);

        return {
            m1Rate: this.m1Rate,
            m5Rate: this.m5Rate,
            m15Rate: this.m15Rate,
            meanRate
        };
    }

    reset(): void {
        this.count = 0;
        this.startTime = Date.now();
        this.lastUpdateTime = this.startTime;
        this.m1Rate = 0;
        this.m5Rate = 0;
        this.m15Rate = 0;
    }
}

// 指标注册表
export class MetricRegistry {
    private metrics: Map<string, Metric> = new Map();
    private static instance: MetricRegistry;

    // 单例模式
    static getInstance(): MetricRegistry {
        if (!MetricRegistry.instance) {
            MetricRegistry.instance = new MetricRegistry();
        }
        return MetricRegistry.instance;
    }

    private constructor() {
        log.info('Initializing metric registry');
    }

    // 创建计数器
    createCounter(name: string, help: string, tags: MetricTags = {}): Counter {
        const metricId = this.getMetricId(name, tags);

        if (this.metrics.has(metricId)) {
            const metric = this.metrics.get(metricId);
            if (metric instanceof Counter) {
                return metric;
            }
            throw new Error(`Metric ${name} already exists with a different type`);
        }

        const counter = new Counter(name, help, tags);
        this.metrics.set(metricId, counter);
        return counter;
    }

    // 创建仪表
    createGauge(name: string, help: string, tags: MetricTags = {}): Gauge {
        const metricId = this.getMetricId(name, tags);

        if (this.metrics.has(metricId)) {
            const metric = this.metrics.get(metricId);
            if (metric instanceof Gauge) {
                return metric;
            }
            throw new Error(`Metric ${name} already exists with a different type`);
        }

        const gauge = new Gauge(name, help, tags);
        this.metrics.set(metricId, gauge);
        return gauge;
    }

    // 创建直方图
    createHistogram(name: string, help: string, bucketBoundaries: number[], tags: MetricTags = {}): Histogram {
        const metricId = this.getMetricId(name, tags);

        if (this.metrics.has(metricId)) {
            const metric = this.metrics.get(metricId);
            if (metric instanceof Histogram) {
                return metric;
            }
            throw new Error(`Metric ${name} already exists with a different type`);
        }

        const histogram = new Histogram(name, help, bucketBoundaries, tags);
        this.metrics.set(metricId, histogram);
        return histogram;
    }

    // 创建速率指标
    createMeter(name: string, help: string, tags: MetricTags = {}): Meter {
        const metricId = this.getMetricId(name, tags);

        if (this.metrics.has(metricId)) {
            const metric = this.metrics.get(metricId);
            if (metric instanceof Meter) {
                return metric;
            }
            throw new Error(`Metric ${name} already exists with a different type`);
        }

        const meter = new Meter(name, help, tags);
        this.metrics.set(metricId, meter);
        return meter;
    }

    // 获取特定指标
    getMetric(name: string, tags: MetricTags = {}): Metric | undefined {
        const metricId = this.getMetricId(name, tags);
        return this.metrics.get(metricId);
    }

    // 获取所有指标
    getAllMetrics(): Metric[] {
        return Array.from(this.metrics.values());
    }

    // 通过名称获取所有匹配的指标
    getMetricsByName(name: string): Metric[] {
        return this.getAllMetrics().filter(metric => metric.name === name);
    }

    // 生成指标ID
    private getMetricId(name: string, tags: MetricTags): string {
        const sortedTags = Object.entries(tags)
            .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
            .map(([key, value]) => `${key}=${value}`)
            .join(',');

        return sortedTags ? `${name}{${sortedTags}}` : name;
    }

    // 重置所有指标
    resetAll(): void {
        for (const metric of this.metrics.values()) {
            metric.reset();
        }
    }

    // 移除指标
    removeMetric(name: string, tags: MetricTags = {}): boolean {
        const metricId = this.getMetricId(name, tags);
        return this.metrics.delete(metricId);
    }
} 