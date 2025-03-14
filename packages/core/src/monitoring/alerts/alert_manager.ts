import { log } from '@utils/logger';
import { MetricRegistry, Metric, MetricType } from '../metrics/collector';

// 告警级别
export enum AlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

// 告警状态
export enum AlertState {
    OK = 'ok',
    PENDING = 'pending',
    FIRING = 'firing',
    RESOLVED = 'resolved'
}

// 告警条件类型
export enum AlertConditionType {
    THRESHOLD = 'threshold',
    RATE_OF_CHANGE = 'rate_of_change',
    ABSENCE = 'absence',
    ANOMALY = 'anomaly'
}

// 告警条件
export interface AlertCondition {
    type: AlertConditionType;
    // 阈值条件
    threshold?: number;
    operator?: '>' | '>=' | '=' | '<=' | '<';
    // 变化率条件
    changePercent?: number;
    timeWindow?: number;
    // 异常检测条件
    deviationFactor?: number;
    // 缺失条件
    timeoutSeconds?: number;
}

// 告警规则
export interface AlertRule {
    id: string;
    name: string;
    description: string;
    metricName: string;
    metricTags?: Record<string, string>;
    condition: AlertCondition;
    severity: AlertSeverity;
    enabled: boolean;
    groupBy?: string[];
    notificationChannels: string[];
    cooldownPeriod: number; // 冷却期（秒）
    evaluationInterval: number; // 评估间隔（秒）
}

// 告警实例
export interface Alert {
    id: string;
    ruleId: string;
    name: string;
    description: string;
    metricName: string;
    metricValue: number;
    metricTags: Record<string, string>;
    condition: AlertCondition;
    severity: AlertSeverity;
    state: AlertState;
    startsAt: Date;
    endsAt?: Date;
    lastEvaluatedAt: Date;
    lastNotifiedAt?: Date;
    annotations: Record<string, string>;
}

// 通知渠道类型
export enum NotificationChannelType {
    EMAIL = 'email',
    WEBHOOK = 'webhook',
    SLACK = 'slack',
    PAGERDUTY = 'pagerduty',
    CONSOLE = 'console'
}

// 通知渠道
export interface NotificationChannel {
    id: string;
    name: string;
    type: NotificationChannelType;
    enabled: boolean;
    config: Record<string, any>;
}

// 告警管理器配置
export interface AlertManagerConfig {
    enabled: boolean;
    evaluationInterval: number;
    defaultCooldownPeriod: number;
    defaultNotificationChannels: string[];
    retentionDays: number;
}

// 告警管理器
export class AlertManager {
    private static instance: AlertManager;
    private config: AlertManagerConfig;
    private registry: MetricRegistry;
    private rules: Map<string, AlertRule> = new Map();
    private alerts: Map<string, Alert> = new Map();
    private notificationChannels: Map<string, NotificationChannel> = new Map();
    private evaluationTimer?: NodeJS.Timeout;
    private alertListeners: ((alert: Alert) => void)[] = [];

    // 获取单例
    static getInstance(config?: AlertManagerConfig): AlertManager {
        if (!AlertManager.instance && config) {
            AlertManager.instance = new AlertManager(config);
        }
        return AlertManager.instance;
    }

    private constructor(config: AlertManagerConfig) {
        this.config = {
            ...config,
            enabled: config.enabled ?? true,
            evaluationInterval: config.evaluationInterval ?? 60,
            defaultCooldownPeriod: config.defaultCooldownPeriod ?? 300,
            defaultNotificationChannels: config.defaultNotificationChannels ?? [],
            retentionDays: config.retentionDays ?? 7
        };
        this.registry = MetricRegistry.getInstance();
        log.info('Alert manager initialized');
    }

    // 启动告警管理器
    start(): void {
        if (!this.config.enabled) {
            log.info('Alert manager is disabled');
            return;
        }

        if (this.evaluationTimer) {
            clearInterval(this.evaluationTimer);
        }

        this.evaluationTimer = setInterval(() => {
            this.evaluateAllRules().catch(err => {
                log.error('Error evaluating alert rules:', err);
            });
        }, this.config.evaluationInterval * 1000) as unknown as NodeJS.Timeout;

        log.info(`Alert manager started with evaluation interval: ${this.config.evaluationInterval}s`);
    }

    // 停止告警管理器
    stop(): void {
        if (this.evaluationTimer) {
            clearInterval(this.evaluationTimer);
            this.evaluationTimer = undefined;
        }
        log.info('Alert manager stopped');
    }

    // 添加告警规则
    addRule(rule: AlertRule): string {
        if (!rule.id) {
            rule.id = this.generateId();
        }

        // 设置默认值
        rule.cooldownPeriod = rule.cooldownPeriod || this.config.defaultCooldownPeriod;
        rule.evaluationInterval = rule.evaluationInterval || this.config.evaluationInterval;
        rule.notificationChannels = rule.notificationChannels.length > 0
            ? rule.notificationChannels
            : [...this.config.defaultNotificationChannels];

        this.rules.set(rule.id, rule);
        log.info(`Alert rule added: ${rule.name} (${rule.id})`);
        return rule.id;
    }

    // 更新告警规则
    updateRule(id: string, rule: Partial<AlertRule>): boolean {
        const existingRule = this.rules.get(id);
        if (!existingRule) {
            return false;
        }

        this.rules.set(id, { ...existingRule, ...rule, id });
        log.info(`Alert rule updated: ${existingRule.name} (${id})`);
        return true;
    }

    // 删除告警规则
    deleteRule(id: string): boolean {
        const result = this.rules.delete(id);
        if (result) {
            log.info(`Alert rule deleted: ${id}`);
        }
        return result;
    }

    // 获取所有告警规则
    getAllRules(): AlertRule[] {
        return Array.from(this.rules.values());
    }

    // 获取规则
    getRule(id: string): AlertRule | undefined {
        return this.rules.get(id);
    }

    // 添加通知渠道
    addNotificationChannel(channel: NotificationChannel): string {
        if (!channel.id) {
            channel.id = this.generateId();
        }
        this.notificationChannels.set(channel.id, channel);
        log.info(`Notification channel added: ${channel.name} (${channel.id})`);
        return channel.id;
    }

    // 更新通知渠道
    updateNotificationChannel(id: string, channel: Partial<NotificationChannel>): boolean {
        const existingChannel = this.notificationChannels.get(id);
        if (!existingChannel) {
            return false;
        }

        this.notificationChannels.set(id, { ...existingChannel, ...channel, id });
        log.info(`Notification channel updated: ${existingChannel.name} (${id})`);
        return true;
    }

    // 删除通知渠道
    deleteNotificationChannel(id: string): boolean {
        const result = this.notificationChannels.delete(id);
        if (result) {
            log.info(`Notification channel deleted: ${id}`);
        }
        return result;
    }

    // 获取所有通知渠道
    getAllNotificationChannels(): NotificationChannel[] {
        return Array.from(this.notificationChannels.values());
    }

    // 获取通知渠道
    getNotificationChannel(id: string): NotificationChannel | undefined {
        return this.notificationChannels.get(id);
    }

    // 获取所有告警
    getAllAlerts(activeOnly: boolean = false): Alert[] {
        if (!activeOnly) {
            return Array.from(this.alerts.values());
        }

        return Array.from(this.alerts.values()).filter(
            alert => alert.state === AlertState.FIRING || alert.state === AlertState.PENDING
        );
    }

    // 获取告警
    getAlert(id: string): Alert | undefined {
        return this.alerts.get(id);
    }

    // 添加告警监听器
    addAlertListener(listener: (alert: Alert) => void): void {
        this.alertListeners.push(listener);
    }

    // 移除告警监听器
    removeAlertListener(listener: (alert: Alert) => void): void {
        const index = this.alertListeners.indexOf(listener);
        if (index !== -1) {
            this.alertListeners.splice(index, 1);
        }
    }

    // 评估所有规则
    private async evaluateAllRules(): Promise<void> {
        log.debug('Evaluating all alert rules...');

        for (const rule of this.rules.values()) {
            if (!rule.enabled) {
                continue;
            }

            try {
                await this.evaluateRule(rule);
            } catch (error) {
                log.error(`Error evaluating rule ${rule.id} (${rule.name}):`, error);
            }
        }

        // 清理过期的告警
        this.cleanupResolvedAlerts();
    }

    // 评估单个规则
    private async evaluateRule(rule: AlertRule): Promise<void> {
        const metrics = this.registry.getMetricsByName(rule.metricName);

        if (metrics.length === 0) {
            log.debug(`No metrics found for rule: ${rule.name} (${rule.id})`);
            return;
        }

        // 按标签过滤
        const filteredMetrics = this.filterMetricsByTags(metrics, rule.metricTags || {});

        // 按组分组
        const groupedMetrics = this.groupMetricsByTags(filteredMetrics, rule.groupBy || []);

        // 对每个组评估条件
        for (const [groupKey, groupMetrics] of groupedMetrics.entries()) {
            for (const metric of groupMetrics) {
                const alertKey = this.generateAlertKey(rule.id, groupKey, metric);
                const existingAlert = this.alerts.get(alertKey);

                const value = this.getMetricValue(metric);
                const conditionMet = this.evaluateCondition(rule.condition, value, metric);

                if (conditionMet) {
                    await this.handleConditionMet(rule, metric, value, alertKey, existingAlert);
                } else {
                    await this.handleConditionNotMet(alertKey, existingAlert);
                }
            }
        }
    }

    // 处理条件满足的情况
    private async handleConditionMet(
        rule: AlertRule,
        metric: Metric,
        value: number,
        alertKey: string,
        existingAlert?: Alert
    ): Promise<void> {
        const now = new Date();

        if (!existingAlert) {
            // 创建新的告警，初始状态为PENDING
            const alert: Alert = {
                id: alertKey,
                ruleId: rule.id,
                name: rule.name,
                description: rule.description,
                metricName: rule.metricName,
                metricValue: value,
                metricTags: metric.tags,
                condition: rule.condition,
                severity: rule.severity,
                state: AlertState.PENDING,
                startsAt: now,
                lastEvaluatedAt: now,
                annotations: {
                    summary: `${rule.name} - ${this.formatCondition(rule.condition, value)}`,
                    description: rule.description
                }
            };

            this.alerts.set(alertKey, alert);
            log.info(`Alert created in PENDING state: ${rule.name} (${alertKey})`);

            // 通知监听器
            this.notifyListeners(alert);

        } else if (existingAlert.state === AlertState.PENDING) {
            // 如果已经是PENDING状态，检查是否应该转为FIRING
            const pendingDuration = now.getTime() - existingAlert.startsAt.getTime();

            if (pendingDuration >= rule.evaluationInterval * 1000) {
                // 更新为FIRING状态
                existingAlert.state = AlertState.FIRING;
                existingAlert.lastEvaluatedAt = now;
                existingAlert.metricValue = value;

                log.warn(`Alert transitioned to FIRING: ${rule.name} (${alertKey})`);

                // 发送通知
                await this.sendNotifications(existingAlert, rule);

                // 通知监听器
                this.notifyListeners(existingAlert);
            } else {
                // 仍然是PENDING，只更新评估时间和值
                existingAlert.lastEvaluatedAt = now;
                existingAlert.metricValue = value;
            }

        } else if (existingAlert.state === AlertState.FIRING) {
            // 已经是FIRING状态，检查是否需要重新发送通知（基于冷却期）
            existingAlert.lastEvaluatedAt = now;
            existingAlert.metricValue = value;

            // 检查是否超过冷却期
            if (existingAlert.lastNotifiedAt) {
                const timeSinceLastNotification = now.getTime() - existingAlert.lastNotifiedAt.getTime();

                if (timeSinceLastNotification >= rule.cooldownPeriod * 1000) {
                    // 超过冷却期，重新发送通知
                    await this.sendNotifications(existingAlert, rule);
                }
            }

        } else if (existingAlert.state === AlertState.RESOLVED) {
            // 已解决的告警再次触发
            existingAlert.state = AlertState.FIRING;
            existingAlert.lastEvaluatedAt = now;
            existingAlert.metricValue = value;
            existingAlert.endsAt = undefined;

            log.warn(`Resolved alert re-triggered: ${rule.name} (${alertKey})`);

            // 发送通知
            await this.sendNotifications(existingAlert, rule);

            // 通知监听器
            this.notifyListeners(existingAlert);
        }
    }

    // 处理条件不满足的情况
    private async handleConditionNotMet(alertKey: string, existingAlert?: Alert): Promise<void> {
        if (!existingAlert) {
            return;
        }

        const now = new Date();

        if (existingAlert.state === AlertState.FIRING || existingAlert.state === AlertState.PENDING) {
            // 将状态更新为RESOLVED
            existingAlert.state = AlertState.RESOLVED;
            existingAlert.lastEvaluatedAt = now;
            existingAlert.endsAt = now;

            log.info(`Alert resolved: ${existingAlert.name} (${alertKey})`);

            // 通知监听器
            this.notifyListeners(existingAlert);
        }
    }

    // 发送通知
    private async sendNotifications(alert: Alert, rule: AlertRule): Promise<void> {
        const now = new Date();

        for (const channelId of rule.notificationChannels) {
            const channel = this.notificationChannels.get(channelId);

            if (!channel || !channel.enabled) {
                continue;
            }

            try {
                await this.sendNotification(alert, channel);
                log.info(`Notification sent for alert ${alert.id} via channel ${channel.name}`);
            } catch (error) {
                log.error(`Failed to send notification for alert ${alert.id} via channel ${channel.name}:`, error);
            }
        }

        // 更新最后通知时间
        alert.lastNotifiedAt = now;
    }

    // 发送单个通知
    private async sendNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
        switch (channel.type) {
            case NotificationChannelType.CONSOLE:
                this.sendConsoleNotification(alert, channel);
                break;

            case NotificationChannelType.WEBHOOK:
                await this.sendWebhookNotification(alert, channel);
                break;

            // 其他通知类型可以在这里实现

            default:
                log.warn(`Unsupported notification channel type: ${channel.type}`);
        }
    }

    // 发送控制台通知
    private sendConsoleNotification(alert: Alert, channel: NotificationChannel): void {
        const message = this.formatAlertMessage(alert);

        switch (alert.severity) {
            case AlertSeverity.INFO:
                log.info(`[ALERT] ${message}`);
                break;
            case AlertSeverity.WARNING:
                log.warn(`[ALERT] ${message}`);
                break;
            case AlertSeverity.ERROR:
            case AlertSeverity.CRITICAL:
                log.error(`[ALERT] ${message}`);
                break;
        }
    }

    // 发送Webhook通知
    private async sendWebhookNotification(alert: Alert, channel: NotificationChannel): Promise<void> {
        const { url } = channel.config;

        if (!url) {
            throw new Error('Webhook URL not configured');
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    alert: {
                        id: alert.id,
                        name: alert.name,
                        description: alert.description,
                        severity: alert.severity,
                        state: alert.state,
                        startsAt: alert.startsAt.toISOString(),
                        endsAt: alert.endsAt?.toISOString(),
                        metricName: alert.metricName,
                        metricValue: alert.metricValue,
                        metricTags: alert.metricTags,
                        annotations: alert.annotations
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            log.error('Error sending webhook notification:', error);
            throw error;
        }
    }

    // 格式化告警消息
    private formatAlertMessage(alert: Alert): string {
        return `${alert.name} - ${alert.annotations.summary} [${alert.severity.toUpperCase()}]`;
    }

    // 通知监听器
    private notifyListeners(alert: Alert): void {
        for (const listener of this.alertListeners) {
            try {
                listener(alert);
            } catch (error) {
                log.error('Error in alert listener:', error);
            }
        }
    }

    // 评估告警条件
    private evaluateCondition(condition: AlertCondition, value: number, metric: Metric): boolean {
        switch (condition.type) {
            case AlertConditionType.THRESHOLD:
                return this.evaluateThresholdCondition(condition, value);

            case AlertConditionType.RATE_OF_CHANGE:
                return this.evaluateRateOfChangeCondition(condition, metric);

            case AlertConditionType.ABSENCE:
                return this.evaluateAbsenceCondition(condition, metric);

            case AlertConditionType.ANOMALY:
                return this.evaluateAnomalyCondition(condition, metric);

            default:
                log.warn(`Unsupported condition type: ${(condition as any).type}`);
                return false;
        }
    }

    // 评估阈值条件
    private evaluateThresholdCondition(condition: AlertCondition, value: number): boolean {
        const { threshold, operator } = condition;

        if (threshold === undefined || !operator) {
            return false;
        }

        switch (operator) {
            case '>': return value > threshold;
            case '>=': return value >= threshold;
            case '=': return value === threshold;
            case '<=': return value <= threshold;
            case '<': return value < threshold;
            default: return false;
        }
    }

    // 评估变化率条件
    private evaluateRateOfChangeCondition(condition: AlertCondition, metric: Metric): boolean {
        // 简化实现，实际应用中需要存储历史值并计算变化率
        return false;
    }

    // 评估缺失条件
    private evaluateAbsenceCondition(condition: AlertCondition, metric: Metric): boolean {
        // 简化实现，实际应用中需要检查指标最后更新时间
        return false;
    }

    // 评估异常条件
    private evaluateAnomalyCondition(condition: AlertCondition, metric: Metric): boolean {
        // 简化实现，实际应用中需要计算统计偏差
        return false;
    }

    // 获取指标值
    private getMetricValue(metric: Metric): number {
        const value = metric.getValue();

        switch (metric.type) {
            case MetricType.COUNTER:
            case MetricType.GAUGE:
                return value;

            case MetricType.HISTOGRAM:
                // 使用平均值
                return value.count > 0 ? value.sum / value.count : 0;

            case MetricType.METER:
                // 使用1分钟速率
                return value.m1Rate;

            default:
                return 0;
        }
    }

    // 按标签过滤指标
    private filterMetricsByTags(metrics: Metric[], tags: Record<string, string>): Metric[] {
        if (Object.keys(tags).length === 0) {
            return metrics;
        }

        return metrics.filter(metric => {
            for (const [key, value] of Object.entries(tags)) {
                if (metric.tags[key] !== value) {
                    return false;
                }
            }
            return true;
        });
    }

    // 按标签分组指标
    private groupMetricsByTags(metrics: Metric[], groupBy: string[]): Map<string, Metric[]> {
        const result = new Map<string, Metric[]>();

        if (groupBy.length === 0) {
            result.set('default', metrics);
            return result;
        }

        for (const metric of metrics) {
            const groupKey = this.getGroupKey(metric, groupBy);

            if (!result.has(groupKey)) {
                result.set(groupKey, []);
            }

            result.get(groupKey)!.push(metric);
        }

        return result;
    }

    // 获取分组键
    private getGroupKey(metric: Metric, groupBy: string[]): string {
        const parts: string[] = [];

        for (const key of groupBy) {
            const value = metric.tags[key] || '_none_';
            parts.push(`${key}=${value}`);
        }

        return parts.join(',');
    }

    // 生成告警键
    private generateAlertKey(ruleId: string, groupKey: string, metric: Metric): string {
        return `${ruleId}:${groupKey}:${metric.name}`;
    }

    // 格式化条件
    private formatCondition(condition: AlertCondition, value: number): string {
        switch (condition.type) {
            case AlertConditionType.THRESHOLD:
                return `${value} ${condition.operator} ${condition.threshold}`;

            case AlertConditionType.RATE_OF_CHANGE:
                return `Change rate ${condition.operator} ${condition.changePercent}% in ${condition.timeWindow}s`;

            case AlertConditionType.ABSENCE:
                return `No data for ${condition.timeoutSeconds}s`;

            case AlertConditionType.ANOMALY:
                return `Deviation factor ${condition.operator} ${condition.deviationFactor}`;

            default:
                return `Unknown condition type: ${condition.type}`;
        }
    }

    // 清理已解决的告警
    private cleanupResolvedAlerts(): void {
        const now = Date.now();
        const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;

        for (const [id, alert] of this.alerts.entries()) {
            if (alert.state === AlertState.RESOLVED && alert.endsAt) {
                const age = now - alert.endsAt.getTime();

                if (age > retentionMs) {
                    this.alerts.delete(id);
                    log.debug(`Cleaned up old resolved alert: ${id}`);
                }
            }
        }
    }

    // 生成唯一ID
    private generateId(): string {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
} 